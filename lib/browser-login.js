/**
 * Porsche Connect Browser-based Login
 * Uses Puppeteer to automate the login flow through a real browser
 *
 * NOTE: This is only needed for INITIAL setup to get a refresh token.
 * For production, use TokenManager with a refresh token instead!
 */

const crypto = require('crypto');

// Make puppeteer optional - only load if needed
let puppeteer = null;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  // Puppeteer not installed - that's OK if using refresh token
}

class BrowserLogin {
  constructor(logger) {
    this.log = logger || console;
    this.browser = null;
    this.page = null;
  }

  /**
   * Generate PKCE code challenge
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

  /**
   * Login to Porsche Connect and retrieve access token
   * @param {string} username - Porsche Connect email
   * @param {string} password - Porsche Connect password
   * @param {boolean} headless - Run browser in headless mode (default: true)
   * @returns {Promise<Object>} Session object with access_token, refresh_token, etc.
   */
  async login(username, password, headless = true) {
    try {
      // Check if puppeteer is available
      if (!puppeteer) {
        throw new Error(
          'Puppeteer is not installed. ' +
          'For production use, configure a refresh token instead (see setup-refresh-token.js). ' +
          'To use browser login, install puppeteer: npm install puppeteer@19.11.1'
        );
      }

      this.log.info('Starting browser-based login...');

      // Launch browser
      this.browser = await puppeteer.launch({
        headless: headless ? 'new' : false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-gpu',
          '--disable-software-rasterizer',
        ],
        ignoreDefaultArgs: ['--disable-extensions'],
        dumpio: false,
        timeout: 60000,
      });

      this.page = await this.browser.newPage();

      // Set user agent to iPhone
      await this.page.setUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
      );

      // Set viewport
      await this.page.setViewport({ width: 375, height: 812 });

      // Generate PKCE challenge
      const [code_verifier, codeChallenge] = this.getCodeChallenge();
      const state = 'iobroker_' + Math.random().toString(36).substring(7);

      // Build authorization URL
      const authUrl =
        'https://identity.porsche.com/authorize?' +
        'scope=openid%20profile%20email%20offline_access%20mbb%20ssodb%20badge%20vin%20dealers%20cars%20charging%20manageCharging%20plugAndCharge%20climatisation%20manageClimatisation' +
        '&code_challenge_method=S256' +
        '&device=touch' +
        '&redirect_uri=my-porsche-app://auth0/callback' +
        '&client_id=XhygisuebbrqQ80byOuU5VncxLIm8E6H' +
        '&prompt=login' +
        '&response_type=code' +
        '&code_challenge=' +
        codeChallenge +
        '&ext-country=DE' +
        '&audience=https://api.porsche.com' +
        '&state=' +
        state +
        '&ui_locales=de-DE';

      this.log.debug('Navigating to authorization URL');
      await this.page.goto(authUrl, { waitUntil: 'networkidle0', timeout: 30000 });

      // Wait for username field and fill it
      this.log.info('Waiting for login form...');
      await this.page.waitForSelector('input[name="username"]', { timeout: 15000 });

      this.log.info('Entering username...');
      await this.page.type('input[name="username"]', username, { delay: 100 });

      // Click continue or submit button
      this.log.info('Clicking continue button...');
      const continueButton = await this.page.$('button[type="submit"], button[name="action"]');
      if (continueButton) {
        await Promise.all([
          this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {}),
          continueButton.click(),
        ]);
        await this.page.waitForTimeout(2000);
      }

      // Click "Mit Passwort einloggen" button
      this.log.info('Clicking "Mit Passwort einloggen" button...');
      await this.page.waitForTimeout(1000);

      // Try different selectors for the password login button
      const passwordLoginButton = await this.page.evaluateHandle(() => {
        // Find button with text "Mit Passwort einloggen"
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(b => b.textContent.includes('Mit Passwort einloggen'));
      });

      if (passwordLoginButton) {
        await Promise.all([
          this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {}),
          passwordLoginButton.asElement().click(),
        ]);
        await this.page.waitForTimeout(2000);
      }

      // Wait for password field and fill it
      this.log.info('Waiting for password field...');
      await this.page.waitForSelector('input[type="password"]', { timeout: 15000 });

      this.log.info('Entering password...');
      await this.page.type('input[type="password"]', password, { delay: 100 });

      // Set up listener for navigation to callback URL
      const authCodePromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for authorization code'));
        }, 60000);

        this.page.on('request', (request) => {
          const url = request.url();
          if (url.startsWith('my-porsche-app://auth0/callback')) {
            clearTimeout(timeout);
            this.log.debug('Callback URL intercepted: ' + url);
            const urlParams = new URLSearchParams(url.split('?')[1]);
            const code = urlParams.get('code');
            if (code) {
              resolve(code);
            } else {
              reject(new Error('No authorization code in callback URL'));
            }
          }
        });
      });

      // Submit password form
      this.log.info('Submitting login form...');
      const submitButton = await this.page.$('button[type="submit"], button[name="action"]');
      if (submitButton) {
        await submitButton.click();
      } else {
        // Try form submission
        await this.page.keyboard.press('Enter');
      }

      // Wait for the authorization code
      this.log.info('Waiting for authorization code...');
      const authCode = await authCodePromise;
      this.log.info('Authorization code received');

      // Close browser
      await this.browser.close();
      this.browser = null;

      // Exchange authorization code for access token
      this.log.info('Exchanging code for access token...');
      const axios = require('axios');
      const qs = require('qs');

      const tokenResponse = await axios({
        method: 'post',
        url: 'https://identity.porsche.com/oauth/token',
        headers: {
          Accept: '*/*',
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
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
      });

      this.log.info('Successfully authenticated!');
      return tokenResponse.data;
    } catch (error) {
      this.log.error('Browser login failed: ' + error.message);
      if (this.browser) {
        await this.browser.close();
      }
      throw error;
    }
  }

  /**
   * Close browser if still open
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = BrowserLogin;
