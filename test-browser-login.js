#!/usr/bin/env node
/**
 * Test script for browser-based Porsche login
 */

const BrowserLogin = require('./lib/browser-login');

// Simple logger
const logger = {
  debug: (msg) => console.log(`[DEBUG] ${msg}`),
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ${msg}`),
  error: (msg) => console.log(`[ERROR] ${msg}`),
};

async function test() {
  const username = process.argv[2] || process.env.PORSCHE_USERNAME;
  const password = process.argv[3] || process.env.PORSCHE_PASSWORD;
  const headless = process.argv[4] !== 'show'; // Use 'show' as 4th argument to see browser

  if (!username || !password) {
    console.error('Usage: node test-browser-login.js <username> <password> [show]');
    console.error('   or: PORSCHE_USERNAME=xxx PORSCHE_PASSWORD=yyy node test-browser-login.js');
    console.error('\nAdd "show" as 3rd parameter to see the browser window');
    process.exit(1);
  }

  console.log('\n=== Testing Browser-Based Porsche Login ===\n');
  console.log(`Username: ${username}`);
  console.log(`Password: ${'*'.repeat(password.length)}`);
  console.log(`Headless: ${headless}\n`);

  const browserLogin = new BrowserLogin(logger);

  try {
    const session = await browserLogin.login(username, password, headless);

    console.log('\n✅ Login successful!');
    console.log(`Access token: ${session.access_token.substring(0, 30)}...`);
    console.log(`Token type: ${session.token_type}`);
    console.log(`Expires in: ${session.expires_in} seconds`);
    console.log(`Has refresh token: ${!!session.refresh_token}`);
    console.log(`Refresh token: ${session.refresh_token ? session.refresh_token.substring(0, 30) + '...' : 'N/A'}`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Login failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

test();
