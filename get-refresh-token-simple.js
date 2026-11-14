#!/usr/bin/env node
/**
 * Simple script to extract and save refresh token from test-adapter.js output
 *
 * This is a workaround if browser-login doesn't work on your system.
 * We'll use a manual login flow where you paste the authorization code.
 *
 * Usage:
 *   node get-refresh-token-simple.js
 */

const TokenManager = require('./lib/token-manager');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const logger = {
  debug: (msg) => console.log(`[DEBUG] ${msg}`),
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ${msg}`),
  error: (msg) => console.log(`[ERROR] ${msg}`),
  silly: (msg) => console.log(`[SILLY] ${msg}`),
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function getRefreshToken() {
  console.log('\n=== Porsche Connect Refresh Token - Manual Setup ===\n');
  console.log('This script will help you obtain a refresh token manually.\n');

  const tokenManager = new TokenManager(logger);
  const [code_verifier, codeChallenge] = tokenManager.getCodeChallenge();

  const authUrl = tokenManager.buildAuthUrl(codeChallenge, 'manual_' + Math.random().toString(36).substring(7));

  console.log('Step 1: Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\n');

  console.log('Step 2: After logging in, you will be redirected to a URL like:');
  console.log('   https://security.porsche.com/auth/en-GB/app/callback?code=XXXXX&state=XXXXX\n');

  console.log('Step 3: Copy the ENTIRE redirect URL and paste it below.\n');
  console.log('If the page shows an error (e.g., "Cannot open app"), that\'s normal!');
  console.log('Just copy the URL from the address bar.\n');

  const callbackUrl = await question('Paste the callback URL here: ');
  console.log('');

  try {
    // Extract code from URL
    const authCode = tokenManager.extractCode(callbackUrl);

    if (!authCode) {
      console.error('❌ No authorization code found in URL');
      process.exit(1);
    }

    console.log('✅ Authorization code extracted\n');
    console.log('Step 4: Exchanging code for tokens...\n');

    // Exchange code for tokens, then refresh once to prove it works. Refresh tokens rotate, so the
    // token to keep is the one returned by that refresh – the first one is already used up.
    const firstSession = await tokenManager.exchangeCodeForToken(authCode, code_verifier);
    const session = await tokenManager.refreshAccessToken(firstSession.refresh_token);

    console.log('✅ Tokens received!\n');

    // Save refresh token
    const tokenData = {
      refresh_token: session.refresh_token,
      obtained_at: new Date().toISOString(),
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
    console.log('2. On your ioBroker server, update /opt/iobroker/node_modules/iobroker.porsche/');
    console.log('3. Add the refresh token to adapter configuration');
    console.log('4. Remove Puppeteer dependency (not needed anymore!)\n');

    console.log('💡 Benefits:\n');
    console.log('   ✅ No browser/Puppeteer needed on server');
    console.log('   ✅ Works perfectly in LXC containers');
    console.log('   ✅ Much lower resource usage');
    console.log('   ✅ More reliable\n');

    console.log('✅ Refresh token tested (token refresh works).\n');
    console.log(`   Access token expires in: ${session.expires_in} seconds\n`);

    console.log('✅ Setup complete!\n');

    rl.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    rl.close();
    process.exit(1);
  }
}

getRefreshToken();
