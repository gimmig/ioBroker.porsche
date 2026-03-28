'use strict';

const utils        = require('@iobroker/adapter-core');
const axios        = require('axios').default;
const Json2iob     = require('json2iob');
const { v4: uuidv4 } = require('uuid');
const TokenManager = require('./lib/token-manager');

// ── Constants ────────────────────────────────────────────────────────────────
const API_BASE          = 'https://api.ppa.porsche.com/app/connect/v1';
const CLIENT_ID         = '41843fb4-691d-4970-85c7-2673e8ecef40';
const REQUEST_TIMEOUT   = 30000;   // ms — prevents requests hanging forever
const RETRY_COUNT       = 3;
const RETRY_BASE_DELAY  = 2000;    // ms — doubles on each attempt
const TOKEN_REFRESH_MARGIN = 0.9;  // refresh at 90% of expires_in to avoid edge expiry
const FORCE_REFRESH_INTERVAL = 1000 * 60 * 60 * 3; // 3 hours

// Fields requested from the status endpoint
const STATUS_FIELDS = [
    'ACV_STATE', 'BATTERY_CHARGING_STATE', 'BATTERY_LEVEL', 'BATTERY_TYPE',
    'CHARGING_PROFILES', 'CHARGING_SETTINGS', 'CLIMATIZER_STATE',
    'E_CONSUMPTION_DATA', 'E_RANGE', 'FUEL_LEVEL', 'FUEL_RESERVE',
    'GLOBAL_PRIVACY_MODE', 'GPS_LOCATION', 'HEATING_STATE',
    'INTERMEDIATE_SERVICE_RANGE', 'INTERMEDIATE_SERVICE_TIME',
    'LOCATION_ALARMS', 'LOCK_STATE_VEHICLE', 'MAIN_SERVICE_RANGE',
    'MAIN_SERVICE_TIME', 'MILEAGE', 'OIL_LEVEL_CURRENT', 'OIL_LEVEL_MAX',
    'OIL_LEVEL_MIN_WARNING', 'OIL_SERVICE_RANGE', 'OIL_SERVICE_TIME',
    'OPEN_STATE_CHARGE_FLAP_LEFT', 'OPEN_STATE_CHARGE_FLAP_RIGHT',
    'OPEN_STATE_DOOR_FRONT_LEFT', 'OPEN_STATE_DOOR_FRONT_RIGHT',
    'OPEN_STATE_DOOR_REAR_LEFT', 'OPEN_STATE_DOOR_REAR_RIGHT',
    'OPEN_STATE_LID_FRONT', 'OPEN_STATE_LID_REAR', 'OPEN_STATE_SERVICE_FLAP',
    'OPEN_STATE_SPOILER', 'OPEN_STATE_SUNROOF', 'OPEN_STATE_TOP',
    'OPEN_STATE_WINDOW_FRONT_LEFT', 'OPEN_STATE_WINDOW_FRONT_RIGHT',
    'OPEN_STATE_WINDOW_REAR_LEFT', 'OPEN_STATE_WINDOW_REAR_RIGHT',
    'PARKING_BRAKE', 'PARKING_LIGHT', 'RANGE', 'REMOTE_ACCESS_AUTHORIZATION',
    'SERVICE_PREDICTIONS', 'THEFT_MODE', 'TIMERS', 'TIRE_PRESSURE',
    'TRIP_STATISTICS_CYCLIC', 'TRIP_STATISTICS_LONG_TERM',
    'TRIP_STATISTICS_SHORT_TERM', 'VTS_MODES',
];

const REMOTE_CONTROLS = [
    { command: 'REMOTE_HEATING_START',         name: 'True = Start' },
    { command: 'REMOTE_HEATING_STOP',          name: 'True = Stop' },
    { command: 'REMOTE_ACV_START',             name: 'True = Start' },
    { command: 'REMOTE_ACV_STOP',              name: 'True = Stop' },
    { command: 'REMOTE_CLIMATIZER_START',      name: 'True = Start' },
    { command: 'REMOTE_CLIMATIZER_STOP',       name: 'True = Stop' },
    { command: 'REMOTE_CLIMATIZER-temperature',name: 'Climatizer target temperature', type: 'number', role: 'value.temperature' },
    { command: 'LOCK',                         name: 'True = Lock' },
    { command: 'UNLOCK',                       name: 'True = Unlock' },
    { command: 'Refresh',                      name: 'True = Refresh data' },
    { command: 'Force_Refresh',                name: 'True = Wake up car and refresh' },
];

// ── Adapter ──────────────────────────────────────────────────────────────────
class Porsche extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: 'porsche' });
        this.on('ready',       this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload',      this.onUnload.bind(this));

        this.json2iob      = new Json2iob(this);
        this.session       = {};
        this.deviceArray   = [];
        this.lastForceRefresh = 0;

        // Token refresh lock — prevents concurrent refresh calls
        this._refreshing        = false;
        this._refreshPromise    = null;

        // Shutdown flag — prevents new timers being created during teardown
        this._unloading = false;

        // Timer handles
        this.updateInterval      = null;
        this.refreshTokenInterval = null;
        this.reLoginTimeout      = null;
        this.refreshTokenTimeout = null;
        this.refreshTimeout      = null;

        this.requestClient = axios.create({
            timeout: REQUEST_TIMEOUT,
        });
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    async onReady() {
        this.setState('info.connection', false, true);

        if (this.config.interval < 0.5) {
            this.log.info('Interval below minimum — setting to 0.5 minutes');
            this.config.interval = 0.5;
        }
        if (!this.config.refreshToken) {
            this.log.error('No refresh token configured. Run get-refresh-token-simple.js to obtain one.');
            return;
        }

        this.subscribeStates('*');
        const ok = await this.login();
        if (!ok) return;

        await this.getDeviceList();
        await this.updateDevices(true);

        // Poll for status updates
        this.updateInterval = setInterval(async () => {
            if (!this._unloading) await this.updateDevices();
        }, this.config.interval * 60 * 1000);

        // Schedule proactive token refresh at 90% of token lifetime
        this._scheduleTokenRefresh();
    }

    onUnload(callback) {
        this._unloading = true;
        try {
            this.setState('info.connection', false, true);
            this.updateInterval       && clearInterval(this.updateInterval);
            this.refreshTokenInterval && clearInterval(this.refreshTokenInterval);
            this.reLoginTimeout       && clearTimeout(this.reLoginTimeout);
            this.refreshTokenTimeout  && clearTimeout(this.refreshTokenTimeout);
            this.refreshTimeout       && clearTimeout(this.refreshTimeout);
        } catch (_) { /* ignore */ }
        callback();
    }

    // ── Auth ──────────────────────────────────────────────────────────────────

    async login() {
        try {
            this.log.info('Authenticating with refresh token...');
            const tokenManager = new TokenManager(this.log);
            this.session = await tokenManager.refreshAccessToken(this.config.refreshToken);
            this.setState('info.connection', true, true);
            this.log.info('Authentication successful');

            if (this.session.refresh_token && this.session.refresh_token !== this.config.refreshToken) {
                this.log.warn('Refresh token was rotated — update the "refreshToken" setting with: ' +
                    this.session.refresh_token.substring(0, 20) + '...');
            }
            return true;
        } catch (error) {
            this.log.error('Login failed: ' + error.message);
            this.log.error('Refresh token may be expired. Re-run get-refresh-token-simple.js.');
            this.setState('info.connection', false, true);
            return false;
        }
    }

    /**
     * Refresh the access token. Concurrent calls share one in-flight promise
     * so only one actual HTTP request is ever made at a time.
     */
    async refreshToken() {
        if (this._refreshing) {
            this.log.debug('Token refresh already in progress — waiting for it');
            return this._refreshPromise;
        }
        this._refreshing     = true;
        this._refreshPromise = this._doRefreshToken().finally(() => {
            this._refreshing     = false;
            this._refreshPromise = null;
        });
        return this._refreshPromise;
    }

    async _doRefreshToken() {
        if (!this.session.refresh_token) {
            this.log.warn('No refresh_token in session — falling back to full login');
            await this.login();
            return;
        }
        try {
            this.log.debug('Refreshing access token...');
            const tokenManager = new TokenManager(this.log);
            this.session = await tokenManager.refreshAccessToken(this.session.refresh_token);
            this.setState('info.connection', true, true);
            this.log.info('Token refreshed successfully');
            this._scheduleTokenRefresh();
        } catch (error) {
            this.log.error('Token refresh failed: ' + error.message);
            this.setState('info.connection', false, true);
            if (!this._unloading) {
                this.log.info('Scheduling re-login in 60 seconds');
                this.reLoginTimeout && clearTimeout(this.reLoginTimeout);
                this.reLoginTimeout = setTimeout(async () => {
                    if (!this._unloading) await this.login();
                }, 60 * 1000);
            }
        }
    }

    /** Cancel any existing refresh interval and set a new one at 90% of token lifetime. */
    _scheduleTokenRefresh() {
        if (this._unloading) return;
        this.refreshTokenInterval && clearInterval(this.refreshTokenInterval);

        const expiresIn = this.session.expires_in || 3600;
        const refreshIn = Math.floor(expiresIn * TOKEN_REFRESH_MARGIN) * 1000;
        this.log.debug(`Next token refresh in ${Math.round(refreshIn / 1000)}s`);
        this.refreshTokenInterval = setInterval(() => {
            if (!this._unloading) this.refreshToken();
        }, refreshIn);
    }

    // ── Device setup ──────────────────────────────────────────────────────────

    async getDeviceList() {
        let res;
        try {
            res = await this._requestWithRetry({
                method: 'get',
                url: `${API_BASE}/vehicles`,
                headers: this._headers(),
            });
        } catch (error) {
            this.log.error('Failed to fetch vehicle list: ' + error.message);
            return;
        }

        if (!Array.isArray(res.data) || res.data.length === 0) {
            this.log.warn('No vehicles returned from API');
            return;
        }

        // Reset device list so removed vehicles don't keep getting polled
        this.deviceArray = [];

        for (const device of res.data) {
            this.deviceArray.push(device.vin);
            const name = [device.modelName, device.customName].filter(Boolean).join(' ');

            await this.setObjectNotExistsAsync(device.vin, {
                type: 'device', common: { name }, native: {},
            });
            await this.setObjectNotExistsAsync(device.vin + '.remote', {
                type: 'channel', common: { name: 'Remote Controls' }, native: {},
            });
            await this.setObjectNotExistsAsync(device.vin + '.general', {
                type: 'channel', common: { name: 'General Information' }, native: {},
            });

            for (const remote of REMOTE_CONTROLS) {
                this.setObjectNotExists(device.vin + '.remote.' + remote.command, {
                    type: 'state',
                    common: {
                        name:  remote.name || '',
                        type:  remote.type  || 'boolean',
                        role:  remote.role  || 'switch',
                        write: true,
                        read:  true,
                    },
                    native: {},
                });
            }

            this.json2iob.parse(device.vin + '.general', device);

            // Fetch pictures (non-critical — failure doesn't stop the adapter)
            try {
                const picRes = await this._requestWithRetry({
                    method: 'get',
                    url: `${API_BASE}/vehicles/${device.vin}/pictures`,
                    headers: this._headers(),
                });
                this.json2iob.parse(device.vin + '.pictures', picRes.data, { preferedArrayName: 'view' });
            } catch (error) {
                this.log.warn(`Could not fetch pictures for ${device.vin}: ${error.message}`);
            }

            this.log.info(`Vehicle loaded: ${name} (${device.vin})`);
        }
    }

    // ── Polling ───────────────────────────────────────────────────────────────

    async updateDevices(forceRefresh = false) {
        if (!this._sessionValid()) {
            this.log.warn('Cannot update devices — no valid session');
            return;
        }

        // Auto force-refresh every 3 hours to keep car data fresh
        if (!forceRefresh && Date.now() - this.lastForceRefresh > FORCE_REFRESH_INTERVAL) {
            forceRefresh = true;
        }
        if (forceRefresh) {
            this.lastForceRefresh = Date.now();
        }

        const mfParams = STATUS_FIELDS.map(f => `mf=${f}`).join('&');
        const wakeParam = forceRefresh ? `&wakeUpJob=${uuidv4()}` : '';
        const baseUrl = `${API_BASE}/vehicles/$vin?${mfParams}${wakeParam}`;

        for (const vin of this.deviceArray) {
            if (this._unloading) break;
            const url = baseUrl.replace('$vin', vin);
            try {
                const res = await this._requestWithRetry({
                    method: 'get',
                    url,
                    headers: this._headers(),
                });
                if (res.data) {
                    this.json2iob.parse(vin + '.status', res.data, {
                        channelName: 'Status of the car',
                    });
                }
            } catch (error) {
                if (error.response && error.response.status === 401) {
                    this.log.info('401 received — scheduling token refresh in 5 seconds');
                    this.refreshTokenTimeout && clearTimeout(this.refreshTokenTimeout);
                    this.refreshTokenTimeout = setTimeout(() => {
                        if (!this._unloading) this.refreshToken();
                    }, 5000);
                } else {
                    this.log.error(`Status update failed for ${vin}: ${error.message}`);
                }
            }
        }
    }

    // ── State change handler ──────────────────────────────────────────────────

    async onStateChange(id, state) {
        if (!state || state.ack) return;

        const parts = id.split('.');
        if (parts.length < 5 || parts[3] !== 'remote') return;

        const deviceId = parts[2];
        const command  = parts[4];

        // Temperature state is config-only, not a command
        if (command === 'REMOTE_CLIMATIZER-temperature') return;

        if (command === 'Refresh') {
            await this.updateDevices();
            return;
        }
        if (command === 'Force_Refresh') {
            await this.updateDevices(true);
            return;
        }

        if (!this._sessionValid()) {
            this.log.error(`Cannot execute command "${command}" — not authenticated`);
            return;
        }

        const data = { payload: {}, key: command };

        if (command === 'REMOTE_CLIMATIZER_START') {
            const tempState = await this.getStateAsync(deviceId + '.remote.REMOTE_CLIMATIZER-temperature');
            data.payload.temperature = (tempState && tempState.val) ? tempState.val : 22;
        }

        this.log.debug(`Sending command: ${JSON.stringify(data)}`);

        try {
            const res = await this._requestWithRetry({
                method: 'post',
                url: `${API_BASE}/vehicles/${deviceId}/commands`,
                headers: { ...this._headers(), 'content-type': 'application/json' },
                data,
            });
            this.log.info(`Command "${command}" accepted: ${JSON.stringify(res.data)}`);
        } catch (error) {
            this.log.error(`Command "${command}" failed: ${error.message}`);
            if (error.response) this.log.error(JSON.stringify(error.response.data));
            return; // Don't schedule a refresh if the command failed
        }

        // Refresh status after a short delay to pick up the command effect
        if (!this._unloading) {
            this.refreshTimeout && clearTimeout(this.refreshTimeout);
            this.refreshTimeout = setTimeout(async () => {
                if (!this._unloading) await this.updateDevices();
            }, 10 * 1000);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Returns true if we have a non-empty access token. */
    _sessionValid() {
        return !!(this.session && this.session.access_token);
    }

    /** Standard API request headers. */
    _headers() {
        return {
            'accept':           '*/*',
            'x-client-id':      CLIENT_ID,
            'authorization':    'Bearer ' + (this.session.access_token || ''),
            'user-agent':       'ioBroker.porsche',
            'accept-language':  'de',
        };
    }

    /**
     * Wraps requestClient with exponential-backoff retry.
     * Skips retry on 4xx (client errors) — these won't resolve by retrying.
     */
    async _requestWithRetry(config, retries = RETRY_COUNT, baseDelay = RETRY_BASE_DELAY) {
        let lastError;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await this.requestClient(config);
            } catch (error) {
                lastError = error;
                const status = error.response ? error.response.status : 0;
                // Don't retry auth errors or bad requests
                if (status >= 400 && status < 500) throw error;
                if (attempt < retries) {
                    const delay = baseDelay * Math.pow(2, attempt);
                    this.log.warn(`Request failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms: ${error.message}`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }
        throw lastError;
    }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
if (require.main !== module) {
    module.exports = (options) => new Porsche(options);
} else {
    new Porsche();
}
