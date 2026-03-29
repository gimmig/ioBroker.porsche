'use strict';

/**
 * Porsche Connect Token Manager
 * Handles OAuth token operations for the Porsche Connect API.
 */

const axios = require('axios');
const qs = require('qs');
const crypto = require('crypto');
const { CookieJar } = require('tough-cookie');
const { HttpCookieAgent, HttpsCookieAgent } = require('http-cookie-agent/http');

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
     * Full headless login with username + password.
     * Automates the Auth0 login form — no browser or redirect pasting needed.
     * @param {string} username  Porsche ID email
     * @param {string} password  Porsche ID password
     * @returns {Promise<Object>} Session: { access_token, refresh_token, expires_in, ... }
     */
    async loginWithCredentials(username, password) {
        const [codeVerifier, codeChallenge] = this.getCodeChallenge();
        const scope = 'openid profile email offline_access mbb ssodb badge vin dealers cars charging manageCharging plugAndCharge climatisation manageClimatisation';
        const state = 'login_' + Math.random().toString(36).substring(7);

        const jar = new CookieJar();
        const client = axios.create({
            timeout: REQUEST_TIMEOUT_MS,
            httpAgent:  new HttpCookieAgent({ cookies: { jar } }),
            httpsAgent: new HttpsCookieAgent({ cookies: { jar } }),
            maxRedirects: 0,
            validateStatus: s => s < 400,
            headers: {
                'User-Agent': USER_AGENT,
                'Accept-Language': 'de',
            },
        });

        // Step 1: Start authorize flow — follow redirects manually until we hit the login page
        let nextUrl = 'https://identity.porsche.com/authorize' +
            '?scope=' + encodeURIComponent(scope) +
            '&code_challenge_method=S256' +
            '&device=touch' +
            '&redirect_uri=' + encodeURIComponent(REDIRECT_URI) +
            '&client_id=' + CLIENT_ID +
            '&prompt=login' +
            '&response_type=code' +
            '&code_challenge=' + codeChallenge +
            '&ext-country=DE' +
            '&audience=' + encodeURIComponent('https://api.porsche.com') +
            '&state=' + state +
            '&ui_locales=de-DE';

        // Follow 302 redirects manually until we land on the login form
        let loginPageUrl = null;
        for (let i = 0; i < 10; i++) {
            const res = await client.get(nextUrl);
            if (res.status === 302 || res.status === 301) {
                const loc = res.headers['location'];
                if (!loc) throw new Error('Redirect with no Location header');
                nextUrl = loc.startsWith('http') ? loc : new URL(loc, nextUrl).toString();
                // Stop when we've reached the login page
                if (nextUrl.includes('/u/login') || nextUrl.includes('/login')) {
                    loginPageUrl = nextUrl;
                    break;
                }
            } else if (res.status === 200) {
                loginPageUrl = nextUrl;
                break;
            }
        }
        if (!loginPageUrl) throw new Error('Could not reach Porsche login page');

        // Extract Auth0 state from the login page URL query string
        const loginUrlObj = new URL(loginPageUrl);
        const auth0State = loginUrlObj.searchParams.get('state');
        if (!auth0State) throw new Error('No Auth0 state in login URL');

        // Step 2: POST credentials to login form
        const loginPostUrl = 'https://identity.porsche.com/u/login?state=' + auth0State;
        const loginRes = await client.post(
            loginPostUrl,
            qs.stringify({
                username,
                password,
                state: auth0State,
                action: 'default',
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                maxRedirects: 0,
                validateStatus: s => s < 500,
            }
        );

        // Step 3: Follow redirects after login until we hit the my-porsche-app:// callback
        let authCode = null;
        let location = loginRes.headers['location'];

        for (let i = 0; i < 10 && location; i++) {
            if (location.startsWith(REDIRECT_URI) || location.includes('code=')) {
                const codeUrl = new URL(location.replace(/^my-porsche-app:\/\/auth0\/callback/, 'https://callback'));
                authCode = codeUrl.searchParams.get('code');
                break;
            }
            const absUrl = location.startsWith('http') ? location : new URL(location, 'https://identity.porsche.com').toString();
            const r = await client.get(absUrl, { maxRedirects: 0, validateStatus: s => s < 500 });
            location = r.headers['location'];
        }

        if (!authCode) {
            // Wrong credentials typically result in redirect back to login page without a code
            if (location && location.includes('/u/login')) {
                throw new Error('Login failed — check username and password');
            }
            throw new Error('Authorization code not received after login');
        }

        // Step 4: Exchange code for tokens
        this.log.debug('Credentials login: exchanging code for tokens');
        return await this.exchangeCodeForToken(authCode, codeVerifier);
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
