/**
 * Porsche Connect Token Manager
 * Handles token refresh without browser automation
 *
 * This is a much more efficient approach for production environments:
 * - No browser/Puppeteer needed in production
 * - Works perfectly in containers/LXC
 * - Lower resource usage
 * - More reliable
 */

const axios = require('axios');
const qs = require('qs');
const crypto = require('crypto');

class TokenManager {
  constructor(logger) {
    this.log = logger || console;
    this.clientId = 'XhygisuebbrqQ80byOuU5VncxLIm8E6H';
    this.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
  }

  /**
   * Refresh an existing access token using a refresh token
   * This is the preferred method for production as it doesn't require browser automation
   *
   * @param {string} refreshToken - The refresh token from a previous authentication
   * @returns {Promise<Object>} New session object with access_token, refresh_token, etc.
   */
  async refreshAccessToken(refreshToken) {
    try {
      this.log.info('Refreshing access token...');

      const tokenResponse = await axios({
        method: 'post',
        url: 'https://identity.porsche.com/oauth/token',
        headers: {
          Accept: '*/*',
          'User-Agent': this.userAgent,
          'Accept-Language': 'de',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: qs.stringify({
          client_id: this.clientId,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });

      this.log.info('Access token refreshed successfully');
      return tokenResponse.data;
    } catch (error) {
      this.log.error('Token refresh failed: ' + error.message);
      if (error.response) {
        this.log.error('Status: ' + error.response.status);
        this.log.error('Data: ' + JSON.stringify(error.response.data));
      }
      throw error;
    }
  }

  /**
   * Exchange an authorization code for tokens
   * Used after browser-based login to get initial tokens
   *
   * @param {string} authCode - Authorization code from OAuth flow
   * @param {string} codeVerifier - PKCE code verifier
   * @returns {Promise<Object>} Session object with access_token, refresh_token, etc.
   */
  async exchangeCodeForToken(authCode, codeVerifier) {
    try {
      this.log.info('Exchanging authorization code for tokens...');

      const tokenResponse = await axios({
        method: 'post',
        url: 'https://identity.porsche.com/oauth/token',
        headers: {
          Accept: '*/*',
          'User-Agent': this.userAgent,
          'Accept-Language': 'de',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: qs.stringify({
          client_id: this.clientId,
          code: authCode,
          code_verifier: codeVerifier,
          grant_type: 'authorization_code',
          redirect_uri: 'my-porsche-app://auth0/callback',
        }),
      });

      this.log.info('Tokens received successfully');
      return tokenResponse.data;
    } catch (error) {
      this.log.error('Token exchange failed: ' + error.message);
      if (error.response) {
        this.log.error('Status: ' + error.response.status);
        this.log.error('Data: ' + JSON.stringify(error.response.data));
      }
      throw error;
    }
  }

  /**
   * Generate PKCE code challenge
   * @returns {Array} [code_verifier, code_challenge]
   */
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
}

module.exports = TokenManager;
