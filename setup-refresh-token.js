#!/usr/bin/env node
/**
 * One-time setup script to obtain refresh token
 *
 * Run this ONCE on your local machine (Mac) with browser support.
 * It will authenticate and save the refresh_token.
 *
 * Then copy the refresh_token to your server's adapter configuration.
 * The server will use only token refresh (no browser needed!).
 *
 * Usage:
 *   node setup-refresh-token.js <email> <password>
 */

const BrowserLogin = require('./lib/browser-login');
const fs = require('fs');
const path = require('path');

const logger = {
  debug: (msg) => console.log(`[DEBUG] ${msg}`),
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ${msg}`),
  error: (msg) => console.log(`[ERROR] ${msg}`),
  silly: (msg) => console.log(`[SILLY] ${msg}`),
};

async function setupRefreshToken() {
  const username = process.argv[2] || process.env.PORSCHE_USERNAME;
  const password = process.argv[3] || process.env.PORSCHE_PASSWORD;

  if (!username || !password) {
    console.error('Usage: node setup-refresh-token.js <username> <password>');
    console.error('');
    console.error('This script will:');
    console.error('1. Authenticate using browser automation (Puppeteer)');
    console.error('2. Save the refresh_token to .porsche-refresh-token.json');
    console.error('3. Display instructions for server configuration');
    process.exit(1);
  }

  console.log('\n=== Porsche Connect Refresh Token Setup ===\n');
  console.log(`Username: ${username}`);
  console.log(`Password: ${'*'.repeat(password.length)}\n`);

  try {
    // Step 1: Browser-based login
    console.log('Step 1: Performing browser-based login...');
    const browserLogin = new BrowserLogin(logger);
    const session = await browserLogin.login(username, password, true);

    console.log('✅ Login successful!\n');

    // Step 2: Save refresh token
    const tokenData = {
      refresh_token: session.refresh_token,
      obtained_at: new Date().toISOString(),
      username: username,
      expires_note: 'Refresh tokens typically expire after 90 days of inactivity',
    };

    const tokenFile = path.join(__dirname, '.porsche-refresh-token.json');
    fs.writeFileSync(tokenFile, JSON.stringify(tokenData, null, 2));

    console.log('✅ Refresh token saved to: .porsche-refresh-token.json\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('REFRESH TOKEN (copy this to your ioBroker server):');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(session.refresh_token);
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('📋 Next steps:\n');
    console.log('1. Copy the refresh token above');
    console.log('2. On your ioBroker server, add it to the adapter configuration:');
    console.log('   - Open ioBroker web interface');
    console.log('   - Go to Porsche adapter settings');
    console.log('   - Paste the refresh token in the "Refresh Token" field');
    console.log('   - Leave username/password fields EMPTY (not needed anymore!)');
    console.log('   - Save and restart the adapter\n');

    console.log('💡 Benefits:\n');
    console.log('   ✅ No browser/Puppeteer needed on server');
    console.log('   ✅ Works perfectly in LXC containers');
    console.log('   ✅ Much lower resource usage');
    console.log('   ✅ More reliable\n');

    console.log('⚠️  Important:\n');
    console.log('   - Refresh tokens expire after ~90 days of inactivity');
    console.log('   - If token expires, re-run this script to get a new one');
    console.log('   - Keep this token secure (like a password!)\n');

    // Test the refresh token immediately
    console.log('🧪 Testing refresh token...\n');
    const TokenManager = require('./lib/token-manager');
    const tokenManager = new TokenManager(logger);
    const refreshedSession = await tokenManager.refreshAccessToken(session.refresh_token);

    console.log('✅ Refresh token works! Token refresh test successful.\n');
    console.log(`   New access token expires in: ${refreshedSession.expires_in} seconds\n`);

    console.log('✅ Setup complete! Your server is ready to use token-based authentication.\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

setupRefreshToken();
