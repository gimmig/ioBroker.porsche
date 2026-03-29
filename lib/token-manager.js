'use strict';

/**
 * Porsche Connect Token Manager
 * Handles OAuth token operations for the Porsche Connect API.
 */

const axios = require('axios');
const qs = require('qs');
const crypto = require('crypto');

const CLIENT_ID     = 'XhygisuebbrqQ80byOuU5VncxLIm8E6H';
const TOKEN_URL     = 'https://identity.porsche.com/oauth/token';
const REDIRECT_URI  = 'my-porsche-app://auth0/callback';
const REQUEST_TIMEOUT_MS = 30000;
const USER_AGENT    = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

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
            this.log.error(`Token refresh failed [${status}]: ${error.message}`);
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
            this.log.error(`Token exchange failed [${status}]: ${error.message}`);
            throw error;
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
                    scope: 'openid profile email offline_access mbb ssodb badge vin dealers cars charging manageCharging plugAndCharge climatisation manageClimatisation',
                    audience: 'https://api.porsche.com',
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
