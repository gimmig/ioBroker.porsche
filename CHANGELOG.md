# Changelog

## 0.3.0 (2025-11-09)

### 🚀 Major Update: Token-Based Authentication

This release introduces a production-ready token-based authentication system that eliminates the need for browser automation in production environments.

#### ✅ New Features

- **Token-Based Authentication**
  - Added `lib/token-manager.js` for handling OAuth token refresh
  - No browser automation (Puppeteer) needed in production
  - Perfect for containerized environments (LXC, Docker, Proxmox)
  - Automatic token refresh every 60 minutes
  - Significantly reduced resource usage

- **Helper Scripts**
  - `get-refresh-token-simple.js` - Manual token generation (no Puppeteer required)
  - `setup-refresh-token.js` - Automatic token generation (requires Puppeteer)
  - `test-browser-login.js` - Test browser-based authentication

- **Admin UI Enhancement**
  - Added "Refresh Token" field in adapter configuration
  - Clear instructions for token-based vs password-based auth
  - Encrypted storage for refresh tokens

#### 🔄 Changes

- **Updated `main.js`**
  - Token refresh is now the primary authentication method
  - Browser-based login as fallback for initial setup
  - Better error messages and logging
  - Displays refresh token after successful browser login for easy copying

- **Updated `lib/browser-login.js`**
  - Made Puppeteer optional (graceful failure if not installed)
  - Clear error messages when Puppeteer is missing
  - Only needed for initial token generation

- **Updated `package.json`**
  - Moved Puppeteer to `optionalDependencies`
  - Not required for production use
  - Saves ~300MB of dependencies

- **Updated `io-package.json`**
  - Added `refreshToken` to native configuration
  - Added encryption for refresh token storage
  - Updated version to 0.3.0

#### 📚 Documentation

- Completely rewritten README.md with:
  - Clear token-based authentication instructions
  - Step-by-step setup guide for different environments
  - Container-specific documentation (LXC, Docker, Proxmox)
  - Troubleshooting section
  - Security information

#### 🐛 Bug Fixes

- Fixed login issues in containerized environments
- Resolved Chrome/Chromium dependency problems in LXC containers
- Better handling of expired tokens

#### 💡 Benefits

- **Resource Efficiency**
  - No Chrome/Chromium required (~500MB saved)
  - No Puppeteer in production (~300MB saved)
  - Minimal RAM usage during token refresh
  - Fast authentication (<1 second vs ~30 seconds)

- **Reliability**
  - Works in any environment
  - No dependency on system libraries
  - No browser-related crashes
  - Automatic token renewal

- **Security**
  - Refresh tokens encrypted in configuration
  - No password storage required
  - Token-based OAuth 2.0 flow
  - Clear token lifecycle management

#### 🔄 Migration from 0.2.0

1. Update to version 0.3.0
2. Generate a refresh token using one of the provided scripts
3. Add refresh token to adapter configuration
4. Remove username/password (optional)
5. Restart adapter
6. Optionally uninstall Puppeteer to save space

#### 🛠️ Technical Details

- Uses Porsche Connect OAuth 2.0 with PKCE
- Client ID: `XhygisuebbrqQ80byOuU5VncxLIm8E6H` (official Porsche app)
- Access tokens valid for 1 hour (auto-refreshed)
- Refresh tokens valid for ~90 days (with activity)
- Token refresh requires only axios (no browser)

---

## 0.2.0

- (TA2k) fix login

## 0.1.0

- (TA2k) fix login

## 0.0.3

- (TA2k) fix status update

## 0.0.2

- (TA2k) initial release
