#!/usr/bin/env bash
# ==============================================================================
# Tyrone Dashboard Orchestrator - Rocky Linux Deployment Script
# Automated Installation of System Dependencies, Node.js, Python, Caddy & Services
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}   Tyrone Dashboard - Rocky Linux Deployment Setup ${NC}"
echo -e "${BLUE}====================================================${NC}"

# 1. Root Privilege Check
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[ERROR] Please run this script as root or with sudo:${NC}"
    echo "  sudo bash deploy.sh"
    exit 1
fi

# Ensure running from the project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
echo -e "${GREEN}[1/8] Working Directory:${NC} $PROJECT_DIR"

# 2. Detect Server IP Address
SERVER_IP=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' || hostname -I | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
    SERVER_IP="127.0.0.1"
fi
echo -e "${GREEN}[2/8] Detected Server IP:${NC} $SERVER_IP"

# 3. Install Core System Tools & Build Dependencies
echo -e "${GREEN}[3/8] Installing System Dependencies via DNF...${NC}"
dnf install -y epel-release dnf-plugins-core
dnf install -y gcc gcc-c++ make sqlite-devel python3 python3-pip python3-devel git curl

# 4. Install Node.js 20 (LTS)
echo -e "${GREEN}[4/8] Setting up Node.js 20 LTS...${NC}"
if ! command -v node &> /dev/null || [ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 18 ]; then
    dnf module reset nodejs -y 2>/dev/null || true
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    dnf install -y nodejs
fi
echo -e "      Node Version: $(node -v)"
echo -e "      NPM Version:  $(npm -v)"

# 5. Install Python Async Dependencies for Redfish Engine
echo -e "${GREEN}[5/8] Installing Python Async Backend Dependencies...${NC}"
pip3 install --upgrade pip --quiet
pip3 install aiohttp urllib3 fastapi uvicorn pydantic --quiet

# 6. Install & Configure Caddy Reverse Proxy
echo -e "${GREEN}[6/8] Installing Caddy Web Server...${NC}"
if ! command -v caddy &> /dev/null; then
    dnf copr enable -y @caddy/caddy || true
    dnf install -y caddy
fi

# Copy project Caddyfile to /etc/caddy/Caddyfile
if [ -f "$PROJECT_DIR/Caddyfile" ]; then
    cp -f "$PROJECT_DIR/Caddyfile" /etc/caddy/Caddyfile
fi

# 7. Configure Environment (.env), Project Directories & Build Frontend
echo -e "${GREEN}[7/8] Configuring Project Environment & Building Assets...${NC}"
mkdir -p "$PROJECT_DIR/public/iso-repository" "$PROJECT_DIR/data"

if [ ! -f "$PROJECT_DIR/.env" ]; then
    if [ -f "$PROJECT_DIR/.env.example" ]; then
        cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
    else
        touch "$PROJECT_DIR/.env"
    fi
fi

# Set or update ISO_HOSTING_URL and NODE_ENV
if ! grep -q "^ISO_HOSTING_URL=" "$PROJECT_DIR/.env"; then
    echo "ISO_HOSTING_URL=http://${SERVER_IP}:8080" >> "$PROJECT_DIR/.env"
else
    sed -i "s|^ISO_HOSTING_URL=.*|ISO_HOSTING_URL=http://${SERVER_IP}:8080|" "$PROJECT_DIR/.env"
fi

if ! grep -q "^NODE_ENV=" "$PROJECT_DIR/.env"; then
    echo "NODE_ENV=production" >> "$PROJECT_DIR/.env"
else
    sed -i "s|^NODE_ENV=.*|NODE_ENV=production|" "$PROJECT_DIR/.env"
fi

# Install Node modules & compile static assets
npm install
npm run build

# Configure Firewalld if active
if systemctl is-active --quiet firewalld; then
    echo -e "${YELLOW}Configuring firewalld rules for ports 80, 8080, 3000, 8000...${NC}"
    firewall-cmd --permanent --add-port=80/tcp || true
    firewall-cmd --permanent --add-port=8080/tcp || true
    firewall-cmd --permanent --add-port=3000/tcp || true
    firewall-cmd --permanent --add-port=8000/tcp || true
    firewall-cmd --reload || true
fi

# 8. Setup & Start Systemd Services
echo -e "${GREEN}[8/8] Setting up Systemd Services...${NC}"

# Dashboard Service
cat <<EOF > /etc/systemd/system/tyrone-dashboard.service
[Unit]
Description=Tyrone Dashboard Orchestrator
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${PROJECT_DIR}
ExecStart=$(which npm) start
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable tyrone-dashboard
systemctl restart tyrone-dashboard

systemctl enable caddy
systemctl restart caddy

echo -e "\n${BLUE}====================================================${NC}"
echo -e "${GREEN} SUCCESS! Tyrone Dashboard is now deployed and running!${NC}"
echo -e "${BLUE}====================================================${NC}"
echo -e " 🌐 Dashboard Web Interface: ${YELLOW}http://${SERVER_IP}${NC}"
echo -e " 💿 ISO Repository Server:   ${YELLOW}http://${SERVER_IP}:8080${NC}"
echo -e " ⚙️  Backend Node Process:    ${YELLOW}http://${SERVER_IP}:3000${NC}"
echo -e " 🐍 Redfish FastAPI Engine:  ${YELLOW}http://${SERVER_IP}:8000${NC}"
echo -e "${BLUE}====================================================${NC}"
echo -e " Check status anytime with:"
echo -e "   systemctl status tyrone-dashboard"
echo -e "   systemctl status caddy"
echo -e "${BLUE}====================================================${NC}"

