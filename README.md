<div align="center">
<img width="500" alt="Tyrone Systems Logo" src="https://tyronesystems.com/tyrone-new/img/tyrone-logo.png" />
</div>

# Tyrone Dashboard Orchestrator

This repository contains everything you need to run, bridge, and deploy your Tyrone Local-to-Cloud hybrid network infrastructure monitor. It facilitates direct orchestration between cloud-hosted control surfaces and on-premise hardware endpoints.

---

## 📦 Prerequisites & Dependencies

### Python Backend Dependencies (`requirements.txt`)
* `fastapi` - High-performance async REST API framework
* `uvicorn` - ASGI web server implementation
* `aiohttp` - Async HTTP client/server for asyncio
* `httpx` - Next-generation HTTP client
* `asyncpg` - Async PostgreSQL database driver
* `cryptography` - Encryption and token security
* `pydantic` - Data validation and settings management
* `urllib3` - HTTP client for Python
* `requests` - Standard HTTP client library
* `websockets` - Async WebSocket client and server library

### Node.js & React Dependencies (`package.json`)
* **Core & UI**: React 19, Lucide React (Icons), Recharts, Motion (Framer Motion)
* **Networking & Transport**: Axios, WebSockets (`ws`), SSH2, Express, Nodemailer
* **Database & Utilities**: SQLite3, Date-fns, UUID, Dotenv, JS-PDF

---

## 🚀 Local Development Setup

Follow these steps to initialize, install all dependencies, and run both backend & frontend concurrently on your local machine.

### 1. Download & Install Dependencies

Run the following commands in the project root directory:

```bash
# Install Python dependencies
pip install -r requirements.txt

# Install Node.js dependencies
npm install
```

### 2. Start All Services (Backend + Frontend)

To launch both the FastAPI Redfish Engine (`redfish_backend.py`) and Vite React Frontend concurrently with full hot-reloading:

```bash
npm run start:all
```
*Or simply:*
```bash
npm start
```

* Backend running at: `http://localhost:8000`
* Frontend running at: `http://localhost:3000`


## 🌐 Production & OS Deployment with Caddy

To orchestrate OS deployments via Redfish Virtual Media, target BMCs must be able to pull ISO installation media from the dashboard server. Since BMCs typically reside on isolated private networks and often reject HTTPS connections utilizing self-signed certificates, Caddy is integrated to reverse-proxy traffic and serve files over plain HTTP.

### 1. Configure Environment Variables
Add the following variable in your `.env` file (adjusting the IP to match your server's reachable network interface):
```env
# The URL pointing to Caddy's dedicated plain HTTP port for BMCs to fetch ISOs
ISO_HOSTING_URL=http://<YOUR_SERVER_IP>:8080
```

### 2. Run the Dashboard Backend
Start the Node.js dashboard server natively:
```bash
npm run dev
```

### 3. Launch Caddy Reverse Proxy
With [Caddy](https://caddyserver.com/) installed on your server, run the following in the project root:
```bash
caddy run --config Caddyfile
```

Caddy will:
1. Reverse-proxy the dashboard web console and active WebSockets on port `80` to Node.js.
2. Directly serve the large ISO repository files on plain HTTP port `8080`, bypassing the Node.js single-thread event loop for high-performance multi-gigabyte ISO transfers.

---

## 🐧 Automated Deployment on Linux Servers (Ubuntu & Rocky Linux)

When fetching this repository on a fresh **Ubuntu** or **Rocky Linux** server from GitHub:

```bash
git clone <your-repo-url>
cd <repo-folder>
sudo bash deploy.sh
```

### What `deploy.sh` Automatically Handles:
- **OS Auto-Detection**: Detects whether your server runs Ubuntu/Debian (`apt`) or Rocky Linux/RHEL (`dnf`/`yum`).
- **Build Tools**: Installs C/C++ compilers, Python dev tools, SQLite header dependencies, git, and curl.
- **Node.js 22 LTS**: Installs Node.js 22 and NPM from NodeSource.
- **Python Async Engine**: Installs required packages for the Redfish FastAPI backend (`aiohttp`, `fastapi`, `uvicorn`, `pydantic`, `urllib3`).
- **Caddy Web Server**: Configures official repositories and installs Caddy reverse-proxy.
- **Auto IP Binding**: Detects the server's primary network IP and configures `.env` (`ISO_HOSTING_URL=http://<SERVER_IP>:8080`).
- **Asset Compilation**: Runs `npm install` and compiles production static assets (`npm run build`).
- **Firewall Rules**: Automatically updates `ufw` (Ubuntu) or `firewalld` (Rocky Linux) rules for ports `80`, `8080`, `3000`, `8000`.
- **Systemd Integration**: Configures auto-restarting background `systemd` services (`tyrone-dashboard` & `caddy`).