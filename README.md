<div align="center">
<img width="500" alt="Tyrone Systems Logo" src="https://tyronesystems.com/tyrone-new/img/tyrone-logo.png" />
</div>

# Tyrone Dashboard Orchestrator

This repository contains everything you need to run, bridge, and deploy your Tyrone Local-to-Cloud hybrid network infrastructure monitor. It facilitates direct orchestration between cloud-hosted control surfaces and on-premise hardware endpoints.

---

## 🚀 Local Development Setup

Follow these steps to initialize and run the dashboard server and physical hardware relay bridge natively on your local machine.

**Prerequisites:** * Node.js (v18 or higher recommended) installed locally.

### 1. Install Dependencies

Initialize the node modules folder and download required networking packages (`ws`, `axios`, `ssh2`):
```bash
npm install
npm run dev 
```

---

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

## 🐧 Automated Deployment on Rocky Linux Server

When fetching this repository on a fresh Rocky Linux server from GitHub:

```bash
git clone <your-repo-url>
cd <repo-folder>
sudo bash deploy.sh
```

### What `deploy.sh` Automatically Handles:
- Installs DNF build tools (`gcc`, `make`, `sqlite-devel`, `python3-devel`, `git`, `curl`).
- Installs Node.js 20 LTS & NPM.
- Installs Python dependencies for Redfish FastAPI Engine (`aiohttp`, `fastapi`, `uvicorn`, `pydantic`, `urllib3`).
- Installs & configures Caddy reverse-proxy.
- Auto-detects server IP address and updates `.env` configuration.
- Builds static production assets (`npm run build`).
- Configures Firewalld rules for ports `80`, `8080`, `3000`, `8000`.
- Configures and launches background `systemd` services (`tyrone-dashboard` & `caddy`).