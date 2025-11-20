'use strict';

/*
 * Created with @iobroker/create-adapter v2.0.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const axios = require('axios').default;
const qs = require('qs');
const crypto = require('crypto');
const Json2iob = require('json2iob');
const tough = require('tough-cookie');
const { v4: uuidv4 } = require('uuid');
const { HttpsCookieAgent } = require('http-cookie-agent/http');
const BrowserLogin = require('./lib/browser-login');
const TokenManager = require('./lib/token-manager');

class Porsche extends utils.Adapter {
  /**
   * @param {Partial<utils.AdapterOptions>} [options={}]
   */
  constructor(options) {
    super({
      ...options,
      name: 'porsche',
    });
    this.on('ready', this.onReady.bind(this));
    this.on('stateChange', this.onStateChange.bind(this));
    this.on('unload', this.onUnload.bind(this));
    this.deviceArray = [];
    this.json2iob = new Json2iob(this);
    this.lastForceRefresh = 0;
    this.cookieJar = new tough.CookieJar();
    this.requestClient = axios.create({
      withCredentials: true,
      httpsAgent: new HttpsCookieAgent({ cookies: { jar: this.cookieJar } }),
    });
    this.userAgent = 'ioBroker';
  }

  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    // Reset the connection indicator during startup
    this.setState('info.connection', false, true);
    if (this.config.interval < 0.5) {
      this.log.info('Set interval to minimum 0.5');
      this.config.interval = 0.5;
    }
    if (!this.config.username || !this.config.password) {
      this.log.error('Please set username and password in the instance settings');
      return;
    }
    this.userAgent = 'ioBroker v' + this.version;
    this.updateInterval = null;
    this.reLoginTimeout = null;
    this.refreshTokenTimeout = null;
    this.session = {};
    this.subscribeStates('*');

    await this.login();

    if (this.session.access_token) {
      await this.getDeviceList();
      await this.updateDevices(true);
      this.updateInterval = setInterval(async () => {
        await this.updateDevices();
      }, this.config.interval * 60 * 1000);
      this.refreshTokenInterval = setInterval(() => {
        this.refreshToken();
      }, this.session.expires_in * 1000);
    }
  }
  async login() {
    // PRIORITY 1: Token refresh (most efficient, no browser needed!)
    if (this.config.refreshToken) {
      try {
        this.log.info('Using refresh token authentication (recommended)...');
        const tokenManager = new TokenManager(this.log);
        this.session = await tokenManager.refreshAccessToken(this.config.refreshToken);
        this.setState('info.connection', true, true);
        this.log.info('Token refresh successful - no browser needed!');

        // Save the new refresh token if it changed
        if (this.session.refresh_token && this.session.refresh_token !== this.config.refreshToken) {
          this.log.info('Refresh token was renewed, please update your configuration');
          this.log.info('New refresh token: ' + this.session.refresh_token.substring(0, 20) + '...');
        }
        return;
      } catch (error) {
        this.log.warn('Token refresh failed: ' + error.message);
        this.log.warn('Refresh token may be expired or invalid');
        this.log.warn('Falling back to browser-based login...');
      }
    }

    // PRIORITY 2: Browser-based login (fallback, for initial setup or token renewal)
    if (this.config.useBrowserLogin !== false) {
      try {
        this.log.info('Attempting browser-based login...');
        this.log.warn('Note: Browser login requires Puppeteer and Chrome/Chromium');
        this.log.warn('For production, use refresh token instead (see setup-refresh-token.js)');
        const browserLogin = new BrowserLogin(this.log);
        this.session = await browserLogin.login(this.config.username, this.config.password, true);
        this.setState('info.connection', true, true);
        this.log.info('Browser-based login successful');

        // Display the refresh token for future use
        if (this.session.refresh_token) {
          this.log.info('═══════════════════════════════════════════════════════════════');
          this.log.info('SAVE THIS REFRESH TOKEN for production use:');
          this.log.info(this.session.refresh_token);
          this.log.info('═══════════════════════════════════════════════════════════════');
          this.log.info('Add it to adapter config as "Refresh Token" to avoid browser dependency');
        }
        return;
      } catch (error) {
        this.log.warn('Browser-based login failed: ' + error.message);
        this.log.warn('Falling back to HTTP-based login...');
      }
    }

    // Fallback to HTTP-based login (may not work if Porsche requires JavaScript)
    const [code_verifier, codeChallenge] = this.getCodeChallenge();
    const state = 'iobroker_' + Math.random().toString(36).substring(7);

    // Step 1: Initial authorization request
    const loginForm = await this.requestClient({
      method: 'get',
      url:
        'https://identity.porsche.com/authorize?scope=openid%20profile%20email%20offline_access%20mbb%20ssodb%20badge%20vin%20dealers%20cars%20charging%20manageCharging%20plugAndCharge%20climatisation%20manageClimatisation&code_challenge_method=S256&device=touch&redirect_uri=my-porsche-app://auth0/callback&client_id=XhygisuebbrqQ80byOuU5VncxLIm8E6H&prompt=login&response_type=code&code_challenge=' +
        codeChallenge +
        '&ext-country=DE&audience=https://api.porsche.com&state=' +
        state +
        '&ui_locales=de-DE',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-de',
        'User-Agent': this.userAgent,
      },
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
    })
      .then((res) => {
        this.log.debug('Authorization request successful');
        // Extract state from the response URL
        if (res.request && res.request.path) {
          const params = qs.parse(res.request.path.split('?')[1]);
          return params;
        }
        return { state: state };
      })
      .catch((error) => {
        this.log.error('Authorization request failed');
        this.log.error(error.message);
        if (error.response) {
          this.log.error(JSON.stringify(error.response.data));
        }
        return { state: state };
      });

    // Step 2a: Submit username/email
    const identifierResponse = await this.requestClient({
      method: 'post',
      url: 'https://identity.porsche.com/u/login/identifier?state=' + loginForm.state,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': this.userAgent,
        'Accept-Language': 'de-de',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: qs.stringify({
        state: loginForm.state,
        username: this.config.username,
        'js-available': 'true',
        'webauthn-available': 'true',
        'is-brave': 'false',
        'webauthn-platform-available': 'false',
        action: 'default',
      }),
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
    })
      .then((res) => {
        this.log.debug('Username submitted successfully');
        return res;
      })
      .catch((error) => {
        if (error.response && error.response.status === 302) {
          this.log.debug('Username accepted (redirect)');
          return error.response;
        }
        if (error.response && error.response.status === 400) {
          this.log.error('Username submission failed - may need captcha');
          if (error.response.data && error.response.data.includes('captcha')) {
            this.log.error('Captcha required - this is not supported yet');
          }
        }
        this.log.error('Username submission error: ' + error.message);
        throw error;
      });

    // Step 2b: Submit password
    let resumePath = null;
    const passwordResponse = await this.requestClient({
      method: 'post',
      url: 'https://identity.porsche.com/u/login/password?state=' + loginForm.state,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': this.userAgent,
        'Accept-Language': 'de-de',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: qs.stringify({
        state: loginForm.state,
        username: this.config.username,
        password: this.config.password,
        action: 'default',
      }),
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
    })
      .then((res) => {
        this.log.debug('Password response received');
        // Check if we got a redirect in the response
        if (res.status === 302 && res.headers.location) {
          const location = res.headers.location;
          this.log.debug('Password accepted, got redirect to: ' + location);
          resumePath = location;
        }
        return res;
      })
      .catch((error) => {
        if (error.response && error.response.status === 302) {
          // Success - got redirect
          const location = error.response.headers.location;
          this.log.debug('Password accepted, got redirect to: ' + location);
          resumePath = location;
          return error.response;
        }
        if (error.response && error.response.status === 400) {
          this.log.error('Invalid credentials');
          throw error;
        }
        this.log.error('Password submission error: ' + error.message);
        throw error;
      });

    if (!resumePath) {
      this.log.error('No resume/redirect path found after password submission');
      this.log.error('Login flow has changed or credentials are invalid');
      return;
    }

    // Step 3: Follow resume/redirect path to get authorization code
    // Wait a bit before following the path (as per Python implementation)
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // Handle both relative paths (/resume/...) and full URLs (https://my.porsche.com/...)
    const resumeUrl = resumePath.startsWith('http') ? resumePath : 'https://identity.porsche.com' + resumePath;
    this.log.debug('Following redirect chain: ' + resumeUrl);

    let authCode = null;
    let currentUrl = resumeUrl;
    let redirectCount = 0;
    const maxRedirects = 5;

    // Follow redirect chain manually
    while (redirectCount < maxRedirects && !authCode) {
      redirectCount++;
      this.log.debug(`Redirect ${redirectCount}: ${currentUrl}`);

      await this.requestClient({
        method: 'get',
        url: currentUrl,
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': this.userAgent,
          'Accept-Language': 'de-de',
        },
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
      })
        .then((res) => {
          this.log.debug(`Response status: ${res.status}`);
          // Check if we got another redirect
          if (res.status === 302 && res.headers.location) {
            const location = res.headers.location;
            this.log.debug(`Got redirect to: ${location}`);

            // Check if the redirect contains the authorization code
            if (location && location.includes('code=')) {
              const params = qs.parse(location.split('?')[1]);
              authCode = params.code;
              this.log.debug('Authorization code found in redirect location');
            } else {
              // Follow the next redirect
              currentUrl = location.startsWith('http') ? location : 'https://identity.porsche.com' + location;
            }
          } else {
            // No more redirects, stop
            this.log.debug('No more redirects, stopping');
            redirectCount = maxRedirects;
          }
          return res;
        })
        .catch((error) => {
          if (error.message && error.message.includes('Unsupported protocol')) {
            // Got redirect to my-porsche-app://auth0/callback?code=...
            if (error.config && error.request && error.request._options) {
              const fullPath = error.request._options.path;
              this.log.debug('Got callback redirect (unsupported protocol): ' + fullPath);
              const params = qs.parse(fullPath.split('?')[1]);
              authCode = params.code;
              this.log.debug('Authorization code extracted from callback');
              return;
            }
          }
          if (error.response && error.response.status === 302) {
            const location = error.response.headers.location;
            this.log.debug('Got redirect (via error): ' + location);

            // Check if the redirect contains the authorization code
            if (location && location.includes('code=')) {
              const params = qs.parse(location.split('?')[1]);
              authCode = params.code;
              this.log.debug('Authorization code found in error redirect');
            } else {
              // Follow the next redirect
              currentUrl = location.startsWith('http') ? location : 'https://identity.porsche.com' + location;
            }
            return error.response;
          }
          this.log.error('Redirect chain error: ' + error.message);
          redirectCount = maxRedirects; // Stop on error
        });

      // Small delay between redirects
      if (!authCode && redirectCount < maxRedirects) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (!authCode) {
      this.log.error('No authorization code found after resume');
      this.log.error('Please check your credentials and ensure no 2FA is required');
      return;
    }

    // Step 4: Exchange authorization code for access token
    await this.requestClient({
      method: 'post',
      url: 'https://identity.porsche.com/oauth/token',
      headers: {
        Accept: '*/*',
        'User-Agent': this.userAgent,
        'Accept-Language': 'de',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: qs.stringify({
        client_id: 'XhygisuebbrqQ80byOuU5VncxLIm8E6H',
        code: authCode,
        code_verifier: code_verifier,
        grant_type: 'authorization_code',
        redirect_uri: 'my-porsche-app://auth0/callback',
      }),
    })
      .then((res) => {
        this.log.info('Successfully authenticated with Porsche Connect API');
        this.log.debug(JSON.stringify(res.data));
        this.session = res.data;
        this.setState('info.connection', true, true);
      })
      .catch((error) => {
        this.log.error('Token exchange failed');
        this.log.error(error.message);
        if (error.response) {
          this.log.error(JSON.stringify(error.response.data));
        }
      });
  }
  extractHidden(body) {
    const returnObject = {};
    const matches = body.matchAll(/<input (?=[^>]* name=["']([^'"]*)|)(?=[^>]* value=["']([^'"]*)|)/g);
    for (const match of matches) {
      if (match[2] != null) {
        returnObject[match[1]] = match[2];
      }
    }
    return returnObject;
  }
  async getDeviceList() {
    await this.requestClient({
      method: 'get',
      url: 'https://api.ppa.porsche.com/app/connect/v1/vehicles',
      headers: {
        accept: '*/*',
        'x-client-id': '41843fb4-691d-4970-85c7-2673e8ecef40',
        authorization: 'Bearer ' + this.session.access_token,
        'user-agent': this.userAgent,
        'accept-language': 'de',
      },
    })
      .then(async (res) => {
        this.log.debug(JSON.stringify(res.data));

        for (const device of res.data) {
          this.deviceArray.push(device.vin);
          let name = device.modelName;
          if (device.customName) {
            name += ' ' + device.customName;
          }
          await this.setObjectNotExistsAsync(device.vin, {
            type: 'device',
            common: {
              name: name,
            },
            native: {},
          });
          await this.setObjectNotExistsAsync(device.vin + '.remote', {
            type: 'channel',
            common: {
              name: 'Remote Controls',
            },
            native: {},
          });
          await this.setObjectNotExistsAsync(device.vin + '.general', {
            type: 'channel',
            common: {
              name: 'General Information',
            },
            native: {},
          });

          const remoteArray = [
            { command: 'REMOTE_HEATING_START', name: 'True = Start' },
            { command: 'REMOTE_CLIMATIZER-temperature', name: 'REMOTE_CLIMATIZER Temperature', type: 'number', role: 'value' },
            { command: 'REMOTE_HEATING_STOP', name: 'True = Stop' },
            { command: 'REMOTE_ACV_START', name: 'True = Start' },
            { command: 'REMOTE_ACV_STOP', name: 'True = Stop' },
            { command: 'REMOTE_CLIMATIZER_START', name: 'True = Start' },
            { command: 'REMOTE_CLIMATIZER_STOP', name: 'True = Stop' },
            { command: 'LOCK', name: 'True = Lokc' },
            { command: 'UNLOCK', name: 'True = Unlock' },
            { command: 'Refresh', name: 'True = Refresh' },
            { command: 'Force_Refresh', name: 'True = Force Refresh' },
          ];
          remoteArray.forEach((remote) => {
            this.setObjectNotExists(device.vin + '.remote.' + remote.command, {
              type: 'state',
              common: {
                name: remote.name || '',
                type: remote.type || 'boolean',
                role: remote.role || 'boolean',
                write: true,
                read: true,
              },
              native: {},
            });
          });
          this.json2iob.parse(device.vin + '.general', device);
          await this.requestClient({
            method: 'get',
            url: 'https://api.ppa.porsche.com/app/connect/v1/vehicles/' + device.vin + '/pictures',
            headers: {
              accept: '*/*',
              'x-client-id': '41843fb4-691d-4970-85c7-2673e8ecef40',
              authorization: 'Bearer ' + this.session.access_token,
              'user-agent': this.userAgent,
              'accept-language': 'de',
            },
          })
            .then(async (res) => {
              this.log.debug(JSON.stringify(res.data));
              this.json2iob.parse(device.vin + '.pictures', res.data, { preferedArrayName: 'view' });
            })
            .catch((error) => {
              this.log.error(error);
              error.response && this.log.error(JSON.stringify(error.response.data));
            });
        }
      })
      .catch((error) => {
        this.log.error(error);
        error.response && this.log.error(JSON.stringify(error.response.data));
      });
  }

  async updateDevices(forceRefresh) {
    if (Date.now() - this.lastForceRefresh > 1000 * 60 * 60 * 3) {
      // force refresh every 3 hour
      forceRefresh = true;
    }

    this.lastForceRefresh = Date.now();
    let url =
      'https://api.ppa.porsche.com/app/connect/v1/vehicles/$vin?mf=ACV_STATE&mf=BATTERY_CHARGING_STATE&mf=BATTERY_LEVEL&mf=BATTERY_TYPE&mf=BLEID_DDADATA&mf=CAR_ALARMS_HISTORY&mf=CHARGING_PROFILES&mf=CHARGING_SETTINGS&mf=CLIMATIZER_STATE&mf=E_CONSUMPTION_DATA&mf=E_RANGE&mf=FUEL_LEVEL&mf=FUEL_RESERVE&mf=GLOBAL_PRIVACY_MODE&mf=GPS_LOCATION&mf=HEATING_STATE&mf=INTERMEDIATE_SERVICE_RANGE&mf=INTERMEDIATE_SERVICE_TIME&mf=LOCATION_ALARMS&mf=LOCATION_ALARMS_HISTORY&mf=LOCK_STATE_VEHICLE&mf=MAIN_SERVICE_RANGE&mf=MAIN_SERVICE_TIME&mf=MILEAGE&mf=OIL_LEVEL_CURRENT&mf=OIL_LEVEL_MAX&mf=OIL_LEVEL_MIN_WARNING&mf=OIL_SERVICE_RANGE&mf=OIL_SERVICE_TIME&mf=OPEN_STATE_CHARGE_FLAP_LEFT&mf=OPEN_STATE_CHARGE_FLAP_RIGHT&mf=OPEN_STATE_DOOR_FRONT_LEFT&mf=OPEN_STATE_DOOR_FRONT_RIGHT&mf=OPEN_STATE_DOOR_REAR_LEFT&mf=OPEN_STATE_DOOR_REAR_RIGHT&mf=OPEN_STATE_LID_FRONT&mf=OPEN_STATE_LID_REAR&mf=OPEN_STATE_SERVICE_FLAP&mf=OPEN_STATE_SPOILER&mf=OPEN_STATE_SUNROOF&mf=OPEN_STATE_TOP&mf=OPEN_STATE_WINDOW_FRONT_LEFT&mf=OPEN_STATE_WINDOW_FRONT_RIGHT&mf=OPEN_STATE_WINDOW_REAR_LEFT&mf=OPEN_STATE_WINDOW_REAR_RIGHT&mf=PARKING_BRAKE&mf=PARKING_LIGHT&mf=RANGE&mf=REMOTE_ACCESS_AUTHORIZATION&mf=SERVICE_PREDICTIONS&mf=SPEED_ALARMS&mf=SPEED_ALARMS_HISTORY&mf=THEFT_MODE&mf=TIMERS&mf=TIRE_PRESSURE&mf=TRIP_STATISTICS_CYCLIC&mf=TRIP_STATISTICS_LONG_TERM&mf=TRIP_STATISTICS_LONG_TERM_HISTORY&mf=TRIP_STATISTICS_SHORT_TERM&mf=VALET_ALARM&mf=VALET_ALARM_HISTORY&mf=VTS_MODES';

    if (forceRefresh) {
      url += '&wakeUpJob=' + uuidv4();
    }
    const statusArray = [
      {
        path: 'status',
        url: url,
        desc: 'Status of the car',
      },
    ];

    const headers = {
      accept: '*/*',
      'x-client-id': '41843fb4-691d-4970-85c7-2673e8ecef40',
      authorization: 'Bearer ' + this.session.access_token,
      'user-agent': this.userAgent,
      'accept-language': 'de',
    };
    for (const vin of this.deviceArray) {
      for (const element of statusArray) {
        const url = element.url.replace('$vin', vin);

        await this.requestClient({
          method: 'get',
          url: url,
          headers: headers,
        })
          .then((res) => {
            this.log.debug(JSON.stringify(res.data));
            if (!res.data) {
              return;
            }
            const data = res.data;

            const forceIndex = null;
            const preferedArrayName = null;

            this.json2iob.parse(vin + '.' + element.path, data, {
              forceIndex: forceIndex,
              preferedArrayName: preferedArrayName,
              channelName: element.desc,
            });
          })
          .catch((error) => {
            if (error.response) {
              if (error.response.status === 401) {
                error.response && this.log.debug(JSON.stringify(error.response.data));
                this.log.info(element.path + ' receive 401 error. Refresh Token in 60 seconds');
                this.refreshTokenTimeout && clearTimeout(this.refreshTokenTimeout);
                this.refreshTokenTimeout = setTimeout(() => {
                  this.refreshToken();
                }, 1000 * 60);

                return;
              }
            }
            this.log.error(url);
            this.log.error(error);
            error.response && this.log.error(JSON.stringify(error.response.data));
          });
      }
    }
  }
  async refreshToken() {
    if (!this.session) {
      this.log.error('No session found relogin');
      await this.login();
      return;
    }
    await this.requestClient({
      method: 'post',
      url: 'https://identity.porsche.com/oauth/token',
      headers: {
        Accept: '*/*',
        'User-Agent': this.userAgent,
        'Accept-Language': 'de',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: qs.stringify({
        client_id: 'XhygisuebbrqQ80byOuU5VncxLIm8E6H',
        grant_type: 'refresh_token',
        refresh_token: this.session.refresh_token,
      }),
    })
      .then((res) => {
        this.log.debug(JSON.stringify(res.data));
        this.session = res.data;
        this.setState('info.connection', true, true);
      })
      .catch((error) => {
        this.log.error('refresh token failed');
        this.log.error(error);
        error.response && this.log.error(JSON.stringify(error.response.data));
        this.log.error('Start relogin in 1min');
        this.reLoginTimeout && clearTimeout(this.reLoginTimeout);
        this.reLoginTimeout = setTimeout(() => {
          this.login();
        }, 1000 * 60 * 1);
      });
  }

  getCodeChallenge() {
    let hash = '';
    let result = '';
    const chars = '0123456789abcdef';
    result = '';
    for (let i = 64; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];
    hash = crypto.createHash('sha256').update(result).digest('base64');
    hash = hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    return [result, hash];
  }
  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   * @param {() => void} callback
   */
  onUnload(callback) {
    try {
      this.setState('info.connection', false, true);
      this.refreshTimeout && clearTimeout(this.refreshTimeout);
      this.reLoginTimeout && clearTimeout(this.reLoginTimeout);
      this.refreshTokenTimeout && clearTimeout(this.refreshTokenTimeout);
      this.updateInterval && clearInterval(this.updateInterval);
      this.refreshTokenInterval && clearInterval(this.refreshTokenInterval);
      callback();
    } catch (e) {
      callback();
    }
  }

  /**
   * Is called if a subscribed state changes
   * @param {string} id
   * @param {ioBroker.State | null | undefined} state
   */
  async onStateChange(id, state) {
    if (state) {
      if (!state.ack) {
        const deviceId = id.split('.')[2];
        const command = id.split('.')[4];
        if (id.split('.')[3] !== 'remote') {
          return;
        }
        if (command === 'REMOTE_CLIMATIZER-temperature') {
          return;
        }
        if (command === 'Refresh') {
          this.updateDevices();
        }
        if (command === 'Force_Refresh') {
          this.updateDevices(true);
        }

        const data = {
          payload: {},
          key: command,
        };
        if (command === 'REMOTE_CLIMATIZER_START') {
          const temperatureState = await this.getStateAsync(deviceId + '.remote.REMOTE_CLIMATIZER-temperature');
          if (temperatureState) {
            data.payload.temperature = temperatureState.val ? temperatureState.val : 22;
          } else {
            data.payload.temperature = 22;
          }
        }

        this.log.debug(JSON.stringify(data));

        await this.requestClient({
          method: 'post',
          url: 'https://api.ppa.porsche.com/app/connect/v1/vehicles/' + deviceId + '/commands',
          headers: {
            accept: '*/*',
            'x-client-id': '41843fb4-691d-4970-85c7-2673e8ecef40',
            'content-type': 'application/json',
            'accept-language': 'de',
            authorization: 'Bearer ' + this.session.access_token,
            'user-agent': this.userAgent,
          },
          data: data,
        })
          .then((res) => {
            this.log.info(JSON.stringify(res.data));
            return res.data;
          })
          .catch((error) => {
            this.log.error(error);
            if (error.response) {
              this.log.error(JSON.stringify(error.response.data));
            }
          });
        this.refreshTimeout && clearTimeout(this.refreshTimeout);
        this.refreshTimeout = setTimeout(async () => {
          await this.updateDevices();
        }, 10 * 1000);
      }
    }
  }
}

if (require.main !== module) {
  // Export the constructor in compact mode
  /**
   * @param {Partial<utils.AdapterOptions>} [options={}]
   */
  module.exports = (options) => new Porsche(options);
} else {
  // otherwise start the instance directly
  new Porsche();
}
