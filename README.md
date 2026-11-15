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
- 🔐 **Browser Login** - Log in once in your own browser; the adapter keeps the session alive
- 🎛️ **Remote Control** - Climatisation, heating, lock/unlock, on-demand refresh

---

## 📦 Installation

### 1. Install the Adapter

Install via ioBroker Admin interface or:

```bash
iobroker url gimmig/iobroker.porsche
```

### 2. Log in (get a refresh token)

The adapter talks to Porsche with a **refresh token**. You get it once by logging in with your Porsche ID; after that the adapter renews it on its own.

Porsche blocks password logins that come from a server ("Suspicious request requires verification"), so the login happens in **your own browser**:

1. Open the adapter settings in ioBroker Admin.
2. Click **"1. Open Porsche login"** and sign in with your Porsche ID. Solve the CAPTCHA if one is shown.
3. After the login the page may stay blank, keep loading or show an error — **that is expected**. Copy the full address from the address bar. It looks like
   ```
   https://security.porsche.com/auth/en-GB/app/callback?code=XXXXX
   ```
4. Paste it into field **"2. Paste the address after login"** and click **"3. Get token"**.
5. The refresh token is filled in automatically. Click **Save**.

The login code is only valid for a few minutes and only once — if the token request fails, start again at step 2.

**Without ioBroker Admin:** the same flow works on the command line:

```bash
cd /opt/iobroker/node_modules/iobroker.porsche
node get-refresh-token-simple.js
```

Open the printed URL, log in, paste the callback address back into the terminal and copy the printed refresh token into the adapter settings.

The **email/password** fields in the settings are still there, but Porsche normally rejects that login with "Suspicious request". Use the browser login instead.

### 3. Update interval

`Update interval in minutes` controls how often the car's status is fetched (minimum 0.5). Porsche limits how many requests an account may make, so keep it generous — **15–30 minutes, or several hours** if you only need occasional data. Use `remote.Refresh` to fetch fresh data on demand.

---

## 🔄 How Authentication Works

- The access token lives about 1 hour; the adapter renews it shortly before it expires.
- Porsche **rotates** the refresh token on every renewal — the old one stops working. The adapter stores the newest token encrypted in `porsche.0.auth.refreshToken` and uses it on the next start, so restarts and reboots don't log you out.
- The stored token is bound to the token in the settings. Pasting a new token in the settings replaces it.
- If the refresh token is no longer accepted (e.g. after a long time offline or a password change), log in again as described above.

---

## 🚦 Rate Limits and Waking the Car

- When Porsche answers with **429 Too Many Requests**, the adapter pauses all status updates instead of retrying every interval (that would keep the block alive). It honours Porsche's `Retry-After` if sent, otherwise it waits 30 minutes and doubles the pause up to 6 hours. The log shows: `Porsche API rate limit (429) — pausing updates until …`
- At most every 3 hours a regular update also **wakes the car** so the data is current. `remote.Force_Refresh` wakes it immediately. Waking costs the most quota — don't trigger it in automations.

---

## 🎛️ Control Commands

Set `porsche.0.<VIN>.remote.<command>` to `true`:

| Command | Action |
|---------|--------|
| `REMOTE_CLIMATIZER_START` / `REMOTE_CLIMATIZER_STOP` | Start / stop climatisation |
| `REMOTE_CLIMATIZER-temperature` | Target temperature for the next start (number, default 22 °C) |
| `REMOTE_HEATING_START` / `REMOTE_HEATING_STOP` | Start / stop heating |
| `REMOTE_ACV_START` / `REMOTE_ACV_STOP` | Start / stop ACV (only on models that support it) |
| `LOCK` / `UNLOCK` | Lock / unlock the car |
| `Refresh` | Fetch the current status now |
| `Force_Refresh` | Wake the car, then fetch the status |

About 10 seconds after an accepted command the status is fetched again.

---

## 📊 Available Data Points

Under `porsche.0.<VIN>`:

- `general.*` — model, model year, VIN and other vehicle details
- `pictures.*` — vehicle image URLs
- `status.<FIELD>.value.*` — one channel per Porsche status field, for example:

| Field | Example data point |
|-------|--------------------|
| `BATTERY_LEVEL` | `status.BATTERY_LEVEL.value.percent` |
| `E_RANGE` | `status.E_RANGE.value.kilometers` |
| `MILEAGE` | `status.MILEAGE.value.kilometers` |
| `CLIMATIZER_STATE` | `status.CLIMATIZER_STATE.value.isOn` |
| `GPS_LOCATION` | `status.GPS_LOCATION.value.location` (`"lat,lon"`) |
| `LOCK_STATE_VEHICLE` | `status.LOCK_STATE_VEHICLE.value.isLocked` |
| `GLOBAL_PRIVACY_MODE` | `status.GLOBAL_PRIVACY_MODE.value.isEnabled` |

Also included: charging state and profiles, fuel and oil levels, doors/windows/lids, tire pressure, service intervals, timers and trip statistics. Which fields are filled depends on the model.

- `porsche.0.auth.refreshToken` — the rotated refresh token (encrypted, read-only)

---

## 🐳 Container Environments (LXC, Docker, Proxmox)

The adapter needs only Node.js and axios — no browser in the container. The login runs in the browser on your own computer; the token is pasted via ioBroker Admin.

---

## 🛠️ Troubleshooting

### Data is old / not updating
- **Privacy mode is on in the car.** Porsche then returns no current data. Check `status.GLOBAL_PRIVACY_MODE.value.isEnabled` and switch privacy mode off in the car's settings.
- **Rate limit.** Look for `429` in the log — the adapter pauses on its own. Increase the update interval.

### "Suspicious request requires verification"
Porsche blocked the email/password login. Use the browser login.

### The login page keeps loading / loops
Expected after a successful login — copy the address from the address bar as it is (it contains `?code=`).

### "Request failed with status code 403" / "invalid_grant" when getting the token
The login code was already used, expired, or was copied from a different page. Start the browser login again and paste the new address within a few minutes. When the adapter's saved refresh token is rejected, log in again the same way.

### "Cannot find module 'token-manager'"
The adapter is not fully installed:
```bash
cd /opt/iobroker/node_modules/iobroker.porsche
npm install
```

---

## 🔐 Security

- The refresh token in the settings is stored encrypted (`encryptedNative` / `protectedNative`); the rotated token in `auth.refreshToken` is encrypted with ioBroker's system secret.
- Tokens and passwords are never written to the log.
- Anyone with the refresh token can control the car — don't share it, and log in again if it leaks.

---

## 📝 Changelog

### **WORK IN PROGRESS**

- Browser login in the adapter settings (Porsche blocks server password logins); new Porsche callback address
- Rotated refresh token is saved encrypted and survives restarts
- Pause on Porsche rate limit (429) instead of retrying every interval
- Show Porsche's reason when a token request is rejected
- Fixed `get-refresh-token-simple.js` for the new login flow

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
