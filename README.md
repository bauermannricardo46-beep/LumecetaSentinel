# Lumeceta Sentinel

Investment intelligence dashboard with a local, read-only Trading 212 bridge.

## Current build
- Premium dark/purple responsive dashboard
- Trading 212 Live + Demo connection dialog
- Local Node.js API bridge
- Account summary, cash, invested value and P/L
- Live open positions with allocation weights
- No order execution in this build
- GitHub Pages UI deployment workflow

## Run on Windows
1. Install Node.js LTS (Node 24+ recommended).
2. Clone/download this repository.
3. Double-click `run-windows.bat`.
4. Open `http://127.0.0.1:8787` if the browser does not open automatically.
5. Click `Connect Trading 212` and enter your API Key + API Secret.

The backend binds to `127.0.0.1` only, so the Trading 212 credentials stay on the local machine during this development phase.

## Trading 212
The bridge uses the official Public API v0 endpoints for account summary and positions. Live and Demo environments are supported. Authentication uses the API key/secret pair via HTTP Basic Authentication.

## Security
Never commit Trading 212 API keys or secrets. The repository intentionally contains no credentials. Do not paste credentials into GitHub issues, commits, screenshots, or chat.

## Next milestones
1. Historical performance and transaction ingestion
2. Instrument metadata and watchlist
3. Sentinel scoring engine
4. Risk/exposure analytics
5. Native Android shell and signed APK
6. Optional order execution only after the read-only layer is proven stable
