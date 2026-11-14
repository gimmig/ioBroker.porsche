'use strict';

/**
 * Porsche Connect Token Manager
 * Handles OAuth token operations for the Porsche Connect API.
 */

const axios = require('axios');
const qs = require('qs');
const crypto = require('crypto');

const CLIENT_ID     = 'XhygisuebbrqQ80byOuU5VncxLIm8E6H';
const AUTH_URL      = 'https://identity.porsche.com/authorize';
const TOKEN_URL     = 'https://identity.porsche.com/oauth/token';
// Porsche removed my-porsche-app://auth0/callback from the allowed callbacks in Nov 2026;
// the My Porsche app (21.26.x) now uses this https app link.
const REDIRECT_URI  = 'https://security.porsche.com/auth/en-GB/app/callback';
const SCOPE         = 'openid profile email offline_access mbb ssodb badge vin dealers cars charging manageCharging plugAndCharge climatisation manageClimatisation';
const AUDIENCE      = 'https://api.porsche.com';
const REQUEST_TIMEOUT_MS = 30000;
const USER_AGENT    = 'de.porsche.one/21.26.46-row+195601 (android)';

// Auth0 answers every rejected grant with HTTP 403 – the reason is only in the body
function describe(error) {
    const data = error.response && error.response.data;
    if (data && (data.error || data.error_description)) return [data.error, data.error_description].filter(Boolean).join(': ');
    return error.message;
}

class TokenManager {
    constructor(logger) {
        this.log = logger || console;
    }

    /**
     * Refresh an existing access token using a refresh token.
     * @param {string} refreshToken
     * @returns {Promise<Object>} New session: { access_token, refresh_token, expires_in, ... }
     */
    async refreshAccessToken(refreshToken) {
        this.log.debug('Refreshing access token...');
        try {
            const res = await axios({
                method: 'post',
                url: TOKEN_URL,
                timeout: REQUEST_TIMEOUT_MS,
                headers: {
                    'Accept': '*/*',
                    'User-Agent': USER_AGENT,
                    'Accept-Language': 'de',
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                data: qs.stringify({
                    client_id: CLIENT_ID,
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                }),
            });
            this.log.info('Access token refreshed successfully');
            return res.data;
        } catch (error) {
            const status = error.response ? error.response.status : 'no response';
            this.log.error(`Token refresh failed [${status}]: ${describe(error)}`);
            throw error;
        }
    }

    /**
     * Exchange an authorization code for tokens (initial setup only).
     * @param {string} authCode
     * @param {string} codeVerifier
     * @returns {Promise<Object>}
     */
    async exchangeCodeForToken(authCode, codeVerifier) {
        this.log.debug('Exchanging authorization code for tokens...');
        try {
            const res = await axios({
                method: 'post',
                url: TOKEN_URL,
                timeout: REQUEST_TIMEOUT_MS,
                headers: {
                    'Accept': '*/*',
                    'User-Agent': USER_AGENT,
                    'Accept-Language': 'de',
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                data: qs.stringify({
                    client_id: CLIENT_ID,
                    code: authCode,
                    code_verifier: codeVerifier,
                    grant_type: 'authorization_code',
                    redirect_uri: REDIRECT_URI,
                }),
            });
            this.log.info('Authorization code exchanged successfully');
            return res.data;
        } catch (error) {
            const status = error.response ? error.response.status : 'no response';
            this.log.error(`Token exchange failed [${status}]: ${describe(error)}`);
            throw new Error(describe(error));
        }
    }

    /**
     * Login with username + password using the Resource Owner Password Credentials grant.
     * Sends credentials directly to the token endpoint — no browser, no redirect, no CAPTCHA.
     * @param {string} username  Porsche ID email
     * @param {string} password  Porsche ID password
     * @returns {Promise<Object>} Session: { access_token, refresh_token, expires_in, ... }
     */
    async loginWithCredentials(username, password) {
        this.log.debug('Logging in with username/password (ROPC)...');
        try {
            const res = await axios({
                method: 'post',
                url: TOKEN_URL,
                timeout: REQUEST_TIMEOUT_MS,
                headers: {
                    'Accept': '*/*',
                    'User-Agent': USER_AGENT,
                    'Accept-Language': 'de',
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                data: qs.stringify({
                    client_id: CLIENT_ID,
                    grant_type: 'password',
                    username,
                    password,
                    scope: SCOPE,
                    audience: AUDIENCE,
                }),
            });
            this.log.info('Login with credentials successful');
            return res.data;
        } catch (error) {
            const status = error.response ? error.response.status : 'no response';
            const desc = error.response && error.response.data && error.response.data.error_description;
            this.log.error(`Credentials login failed [${status}]: ${desc || error.message}`);
            throw new Error(desc || error.message);
        }
    }

    /**
     * Browser login URL (authorization code + PKCE). The user solves any CAPTCHA in a real browser.
     * @param {string} codeChallenge
     * @param {string} [state]  leave empty for logins that end on the Porsche web app
     * @returns {string}
     */
    buildAuthUrl(codeChallenge, state) {
        const params = new URLSearchParams({
            scope: SCOPE,
            code_challenge_method: 'S256',
            device: 'touch',
            redirect_uri: REDIRECT_URI,
            client_id: CLIENT_ID,
            prompt: 'login',
            response_type: 'code',
            code_challenge: codeChallenge,
            'ext-country': 'DE',
            audience: AUDIENCE,
            ui_locales: 'de-DE',
        });
        // The callback URL belongs to Porsche's web app. Its Auth0 SDK grabs every "?code=…&state=…",
        // fails and starts its own login loop – so no state for the browser login (PKCE protects it).
        if (state) params.set('state', state);
        return `${AUTH_URL}?${params.toString().replace(/\+/g, '%20')}`;
    }

    /**
     * Accepts either the bare code or the whole callback URL copied from the address bar.
     * @param {string} input
     * @returns {string|null}
     */
    extractCode(input) {
        const text = String(input || '').trim();
        if (!text) return null;
        const params = text.replace(/^[^?#]*[?#]?/, '').replace('#', '&');
        const code = params ? new URLSearchParams(params).get('code') : null;
        return code || (/^[\w.-]{10,}$/.test(text) ? text : null);
    }

    /**
     * Generate PKCE code challenge pair.
     * @returns {[string, string]} [code_verifier, code_challenge]
     */
    getCodeChallenge() {
        const chars = '0123456789abcdef';
        let verifier = '';
        for (let i = 64; i > 0; --i) {
            verifier += chars[Math.floor(Math.random() * chars.length)];
        }
        const challenge = crypto
            .createHash('sha256')
            .update(verifier)
            .digest('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
        return [verifier, challenge];
    }
}

module.exports = TokenManager;
