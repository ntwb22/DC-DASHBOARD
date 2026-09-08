#!/usr/bin/env bash
# ==============================================================================
# Tyrone Dashboard Orchestrator - Universal Deployment Script
# Supports: Ubuntu, Debian, Rocky Linux, AlmaLinux, RHEL, CentOS
# Automated Installation of System Dependencies, Node.js, Python, Caddy & Services
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}   Tyrone Dashboard - Universal Deployment Setup    ${NC}"
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

# Detect OS Package Manager
if command -v apt-get &> /dev/null; then
    PKG_MGR="apt"
elif command -v dnf &> /dev/null; then
    PKG_MGR="dnf"
elif command -v yum &> /dev/null; then
    PKG_MGR="yum"
else
    echo -e "${RED}[ERROR] Unsupported distribution. Package manager (apt/dnf/yum) not found.${NC}"
    exit 1
fi
echo -e "${GREEN}      Detected Package Manager:${NC} $PKG_MGR"

# 2. Detect Server IP Address
SERVER_IP=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' || hostname -I | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
    SERVER_IP="127.0.0.1"
fi
echo -e "${GREEN}[2/8] Detected Server IP:${NC} $SERVER_IP"

# 3. Install Core System Tools & Build Dependencies
echo -e "${GREEN}[3/8] Installing System Build Dependencies...${NC}"
if [ "$PKG_MGR" = "apt" ]; then
    apt-get update -y
    apt-get install -y build-essential libsqlite3-dev python3 python3-pip python3-dev git curl gpg
else
    $PKG_MGR install -y epel-release dnf-plugins-core || true
    $PKG_MGR install -y gcc gcc-c++ make sqlite-devel python3 python3-pip python3-devel git curl
fi

# 4. Install Node.js 22 (LTS)
echo -e "${GREEN}[4/8] Setting up Node.js 22 LTS...${NC}"
if ! command -v node &> /dev/null || [ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 18 ]; then
    if [ "$PKG_MGR" = "apt" ]; then
        curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
        apt-get install -y nodejs
    else
        dnf module reset nodejs -y 2>/dev/null || true
        curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
        $PKG_MGR install -y nodejs
    fi
fi
echo -e "      Node Version: $(node -v)"
echo -e "      NPM Version:  $(npm -v)"

# 5. Install Python Async Dependencies for Redfish Engine
echo -e "${GREEN}[5/8] Installing Python Async Backend Dependencies...${NC}"
pip3 install --upgrade pip --quiet --break-system-packages 2>/dev/null || pip3 install --upgrade pip --quiet
pip3 install aiohttp urllib3 fastapi uvicorn pydantic --quiet --break-system-packages 2>/dev/null || pip3 install aiohttp urllib3 fastapi uvicorn pydantic --quiet

# 6. Install & Configure Caddy Reverse Proxy
echo -e "${GREEN}[6/8] Installing Caddy Web Server...${NC}"
if ! command -v caddy &> /dev/null; then
    if [ "$PKG_MGR" = "apt" ]; then
        apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
        apt-get update -y
        apt-get install -y caddy
    else
        dnf copr enable -y @caddy/caddy || true
        $PKG_MGR install -y caddy
    fi
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

# Configure Firewall (firewalld or ufw)
if systemctl is-active --quiet firewalld 2>/dev/null; then
    echo -e "${YELLOW}Configuring firewalld rules for ports 80, 8080, 3000, 8000...${NC}"
    firewall-cmd --permanent --add-port=80/tcp || true
    firewall-cmd --permanent --add-port=8080/tcp || true
    firewall-cmd --permanent --add-port=3000/tcp || true
    firewall-cmd --permanent --add-port=8000/tcp || true
    firewall-cmd --reload || true
fi

if command -v ufw &> /dev/null && ufw status | grep -q "Status: active"; then
    echo -e "${YELLOW}Configuring ufw rules for ports 80, 8080, 3000, 8000...${NC}"
    ufw allow 80/tcp || true
    ufw allow 8080/tcp || true
    ufw allow 3000/tcp || true
    ufw allow 8000/tcp || true
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
