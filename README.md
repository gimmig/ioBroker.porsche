![Logo](admin/porsche.png)

# ioBroker.porsche

[![NPM version](https://img.shields.io/npm/v/iobroker.porsche.svg)](https://www.npmjs.com/package/iobroker.porsche)
[![Downloads](https://img.shields.io/npm/dm/iobroker.porsche.svg)](https://www.npmjs.com/package/iobroker.porsche)
![Number of Installations](https://iobroker.live/badges/porsche-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/porsche-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.porsche.png?downloads=true)](https://nodei.co/npm/iobroker.porsche/)

**Tests:** ![Test and Release](https://github.com/TA2k/ioBroker.porsche/workflows/Test%20and%20Release/badge.svg)

## Porsche Connect Adapter for ioBroker

Connect your Porsche to ioBroker and access vehicle data, charging status, climate control, and more.

---

## 🚀 Features

- 🔋 **Battery & Charging Status** - Monitor charge level, charging status, and range
- 🌡️ **Climate Control** - Check and control climate/pre-conditioning
- 🚗 **Vehicle Data** - Access mileage, fuel level, tire pressure, and more
- 📍 **Location** - Get current vehicle position
- 🔐 **Secure Authentication** - Token-based authentication (recommended) or username/password

---

## 📦 Installation

### 1. Install the Adapter

Install via ioBroker Admin interface or:

```bash
iobroker url gimmig/iobroker.porsche
```

### 2. Configure Authentication

**Recommended: Token-Based Authentication (Production)**

Token-based authentication is more reliable, secure, and works perfectly in containerized environments (LXC, Docker, etc.).

#### **Option A: Manual Token Generation (No Browser Automation Needed)**

1. On your local machine (Mac/Windows/Linux):
   ```bash
   cd /opt/iobroker/node_modules/iobroker.porsche
   node get-refresh-token-simple.js
   ```

2. Open the displayed URL in your browser

3. Log in with your Porsche Connect credentials

4. After login, you'll see an error page ("App cannot be opened") - **this is normal**

5. Copy the entire URL from the address bar:
   ```
   my-porsche-app://auth0/callback?code=XXXXX&state=XXXXX
   ```

6. Paste the URL into the script

7. The script will display your **refresh token**

8. Copy the refresh token to the adapter configuration in ioBroker Admin:
   - **Refresh Token:** `<paste your token here>`

---

## 🔄 How Token-Based Authentication Works

### Initial Setup (One-Time)
1. Generate refresh token using one of the methods above
2. Configure refresh token in adapter settings
3. Save and restart adapter

### Daily Operation
- Adapter automatically refreshes access token every 60 minutes
- No browser or heavy dependencies needed
- Minimal resource usage
- Works reliably in containers (LXC, Docker, Proxmox, etc.)

### Token Expiration
- Refresh tokens typically expire after ~90 days of inactivity
- If token expires, simply generate a new one using the same method

---

## 🎛️ Control Commands

Set `porsche.0.<VIN>.remote.*` states to `true` or `false` to control your vehicle:

| State | Description |
|-------|-------------|
| `directCharge.start` | Start charging |
| `directCharge.stop` | Stop charging |
| `climatisation.start` | Start climate control |
| `climatisation.stop` | Stop climate control |
| `honkAndFlash` | Honk horn and flash lights |
| `flash` | Flash lights |

---

## 📊 Available Data Points

The adapter creates the following data structures under `porsche.0.<VIN>`:

### Status
- `status.batteryLevel` - Battery charge level (%)
- `status.remainingRanges` - Remaining ranges (electric, fuel, total)
- `status.mileage` - Current mileage
- `status.fuelLevel` - Fuel level (for hybrid models)
- `status.chargingStatus` - Current charging status
- `status.climatisationState` - Climate control status

### Position
- `position.latitude` - Current latitude
- `position.longitude` - Current longitude
- `position.heading` - Vehicle heading

### Remote Control
- `remote.directCharge` - Start/stop charging
- `remote.climatisation` - Control climate/pre-conditioning
- `remote.honkAndFlash` - Flash lights and honk
- `remote.flash` - Flash lights only

---

## 🐳 Container Environments (LXC, Docker, Proxmox)

**Token-based authentication works perfectly in containerized environments!**

### Benefits

- Only Node.js + axios required
- No browser dependencies
- ~1 second to refresh token
- Works in any environment

### Setup in Containers

1. **Generate token on your local machine** (where browser works)
2. **Copy token to container** via ioBroker Admin UI
3. **Enjoy automatic token refresh**

---

## 🛠️ Troubleshooting

### "Token refresh failed: invalid_grant"

**Cause:** Refresh token expired or invalid

**Solution:**
1. Generate a new refresh token using `get-refresh-token-simple.js`
2. Update token in adapter configuration
3. Restart adapter

### "Cannot find module 'token-manager'"

**Cause:** Adapter not fully installed

**Solution:**
```bash
cd /opt/iobroker/node_modules/iobroker.porsche
npm install
```

---

## 🔐 Security

### Refresh Token Storage

- Refresh tokens are **encrypted** in ioBroker's configuration
- Stored in `protectedNative` and `encryptedNative` fields
- Never logged or exposed in plain text

### Token Lifecycle

- Access tokens expire after 1 hour (automatically refreshed)
- Refresh tokens expire after ~90 days of inactivity
- Both are handled automatically by the adapter

---

## 📝 Changelog

### 0.3.0 (2025-11-09)

**Major Update: Token-Based Authentication**

- ✅ **Token-based authentication** - Uses refresh token for API access
- ✅ **Added `lib/token-manager.js`** - Handles token refresh
- ✅ **Added admin UI field** - Refresh token configuration in settings
- ✅ **Added `get-refresh-token-simple.js`** - Manual token generation script
- ✅ **Perfect for containers** - Works in LXC, Docker, Proxmox
- ✅ **Better error handling** - Clear messages for token expiration and auth failures
- ✅ **Updated dependencies** - Latest Porsche Connect API client ID

**Migration from 0.2.0:**
1. Generate refresh token using `get-refresh-token-simple.js`
2. Add token to adapter configuration
3. Restart adapter

### 0.2.0

- (TA2k) fix login

### 0.1.0

- (TA2k) fix login

### 0.0.3

- (TA2k) fix status update

### 0.0.2

- (TA2k) initial release

---

## 🤝 Support & Discussion

- **ioBroker Forum:** [Porsche Adapter Discussion](https://forum.iobroker.net/topic/50883/test-adapter-myporsche-v0-0-x)
- **GitHub Issues:** [Report bugs or request features](https://github.com/TA2k/ioBroker.porsche/issues)

---

## 📜 License

MIT License

Copyright (c) 2023-2025 TA2k <tombox2020@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
