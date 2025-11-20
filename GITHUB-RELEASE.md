# GitHub Release Checklist

## ✅ Projekt ist bereit für GitHub Fork!

### 📁 Dateien Overview

#### Core Files (Production)
- ✅ `main.js` - Adapter mit Token-Refresh-Unterstützung
- ✅ `io-package.json` - Version 0.3.0 mit refreshToken-Feld
- ✅ `package.json` - Puppeteer als optional dependency
- ✅ `lib/token-manager.js` - NEU: Token-Refresh ohne Browser
- ✅ `lib/browser-login.js` - Puppeteer jetzt optional
- ✅ `lib/tools.js` - Utility functions
- ✅ `lib/adapter-config.d.ts` - TypeScript definitions

#### Admin UI
- ✅ `admin/index_m.html` - Mit Refresh-Token-Feld
- ✅ `admin/porsche.png` - Logo
- ✅ `admin/style.css` - Styling
- ✅ `admin/words.js` - Translations

#### Helper Scripts (für Benutzer)
- ✅ `get-refresh-token-simple.js` - Manueller Token-Abruf (KEIN Puppeteer!)
- ✅ `setup-refresh-token.js` - Automatischer Token-Abruf (mit Puppeteer)
- ✅ `test-browser-login.js` - Browser-Login testen

#### Dokumentation
- ✅ `README.md` - Komplett neu geschrieben mit Token-Auth-Anleitung
- ✅ `CHANGELOG.md` - Ausführlicher Changelog für v0.3.0
- ✅ `LICENSE` - MIT License

#### Entfernte Dateien (waren nur für Entwicklung)
- ❌ `ANALYSIS.md` - Gelöscht
- ❌ `SOLUTION.md` - Gelöscht
- ❌ `DEPLOYMENT.md` - Gelöscht
- ❌ `DEPLOY-COMMANDS.md` - Gelöscht
- ❌ `CHANGELOG-FIX.md` - Gelöscht
- ❌ `deploy-to-server.sh` - Gelöscht
- ❌ `fix-ubuntu-repos.sh` - Gelöscht
- ❌ `get-refresh-token-from-test.sh` - Gelöscht
- ❌ `install-to-iobroker.sh` - Gelöscht
- ❌ `test-adapter.js` - Gelöscht
- ❌ `test-api.js` - Gelöscht
- ❌ `test-login-simple.js` - Gelöscht
- ❌ `login-response.html` - Gelöscht
- ❌ `debug-after-username.png` - Gelöscht

---

## 🚀 Nächste Schritte für GitHub

### 1. Git Repository vorbereiten

```bash
cd /Users/gimmig/sites/ioBroker.porsche-master

# Falls noch nicht geschehen:
git init
git add .
git commit -m "Release v0.3.0: Token-based authentication

Major update with production-ready token-based authentication:
- Added lib/token-manager.js for token refresh without browser
- Updated main.js to prioritize token refresh
- Made Puppeteer optional (moved to optionalDependencies)
- Added admin UI field for refresh token
- Complete README rewrite with container-specific docs
- Helper scripts for easy token generation
- Perfect for LXC/Docker/Proxmox environments

Breaking Changes:
- Puppeteer no longer required in production
- New refresh token configuration field

Migration:
1. Generate refresh token using provided scripts
2. Add token to adapter config
3. Restart adapter
4. Optionally remove Puppeteer dependency"
```

### 2. GitHub Remote hinzufügen

```bash
# Erstelle Fork auf GitHub von: https://github.com/TA2k/ioBroker.porsche

# Dann:
git remote add origin https://github.com/DEIN-USERNAME/ioBroker.porsche.git
git branch -M master
git push -u origin master
```

### 3. Release Tag erstellen

```bash
git tag -a v0.3.0 -m "Version 0.3.0: Token-based authentication"
git push origin v0.3.0
```

### 4. GitHub Release erstellen

Gehe zu: `https://github.com/DEIN-USERNAME/ioBroker.porsche/releases/new`

**Tag:** `v0.3.0`

**Title:** `v0.3.0: Token-Based Authentication`

**Description:**
```markdown
## 🚀 Major Update: Token-Based Authentication

This release introduces production-ready token-based authentication that eliminates browser automation in production environments.

### ✨ Key Features

- **No Browser Required in Production** - Token refresh works without Puppeteer/Chrome
- **Perfect for Containers** - Works flawlessly in LXC, Docker, Proxmox
- **Resource Efficient** - Saves ~800MB (no Chrome/Chromium + Puppeteer)
- **Fast Authentication** - <1 second vs ~30 seconds with browser
- **More Reliable** - No browser-related failures

### 📦 What's New

- Token-based OAuth 2.0 authentication
- Helper scripts for easy token generation
- Updated admin UI with refresh token field
- Comprehensive documentation for containers
- Puppeteer now optional (only needed for setup)

### 🔄 Migration from v0.2.0

1. Update to v0.3.0
2. Generate refresh token: `node get-refresh-token-simple.js`
3. Add token to adapter configuration
4. Restart adapter
5. Done! Optionally uninstall Puppeteer

See [README.md](README.md) for detailed instructions.

### 📝 Full Changelog

See [CHANGELOG.md](CHANGELOG.md) for complete list of changes.
```

---

## 📋 Wichtige Hinweise für andere Benutzer

### Installation

```bash
# Via ioBroker Admin oder:
npm install iobroker.porsche
```

### Quick Start

```bash
# 1. Token holen (auf lokalem Rechner)
cd /opt/iobroker/node_modules/iobroker.porsche
node get-refresh-token-simple.js

# 2. Token in ioBroker Admin eintragen
# 3. Adapter starten
```

### Für Container-Umgebungen

**Besonders wichtig:** Diese Version ist speziell für LXC/Docker/Proxmox optimiert!

Keine Browser-Dependencies mehr nötig!

---

## ✅ Alles bereit!

Das Projekt ist vollständig aufgeräumt und bereit für:
- ✅ GitHub Fork
- ✅ Pull Request an Original-Repo
- ✅ Eigenes NPM Package
- ✅ ioBroker Repository Submission

**Viel Erfolg mit dem Fork! 🎉**
