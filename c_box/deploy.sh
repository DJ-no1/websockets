#!/bin/bash

# ============================================================================
# C Box - One Command VPS Deployment Script
# ============================================================================
# Usage: bash <(curl -fsSL https://raw.githubusercontent.com/YOUR-USERNAME/c_box/main/deploy.sh)
# Or: bash deploy.sh
# ============================================================================

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}C Box - VPS Deployment Script${NC}"
echo -e "${BLUE}================================${NC}\n"

# ============================================================================
# 1. Clone Repository (if not already in the right directory)
# ============================================================================

read -p "Enter repository URL (or press Enter to skip cloning): " REPO_URL

if [ ! -z "$REPO_URL" ]; then
    echo -e "${BLUE}Cloning repository...${NC}"
    REPO_NAME=$(basename "$REPO_URL" .git)
    git clone "$REPO_URL" "$REPO_NAME"
    cd "$REPO_NAME"
    echo -e "${GREEN}✓ Repository cloned${NC}\n"
else
    echo -e "${YELLOW}Skipping clone - using current directory${NC}\n"
fi

# ============================================================================
# 2. Install System Dependencies
# ============================================================================

echo -e "${BLUE}Checking system dependencies...${NC}"

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js not found. Installing...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo -e "${GREEN}✓ Node.js $(node --version)${NC}"
fi

# Check for Redis
if ! command -v redis-server &> /dev/null; then
    echo -e "${YELLOW}Redis not found. Installing...${NC}"
    sudo apt-get update
    sudo apt-get install -y redis-server
else
    echo -e "${GREEN}✓ Redis installed${NC}"
fi

# Check for pnpm
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}pnpm not found. Installing...${NC}"
    npm install -g pnpm
else
    echo -e "${GREEN}✓ pnpm $(pnpm --version)${NC}"
fi

echo ""

# ============================================================================
# 3. Install Project Dependencies
# ============================================================================

echo -e "${BLUE}Installing project dependencies...${NC}"
pnpm install
echo -e "${GREEN}✓ Dependencies installed${NC}\n"

# ============================================================================
# 4. Setup Environment Variables
# ============================================================================

if [ -f ".env" ]; then
    echo -e "${YELLOW}.env already exists. Skipping...${NC}\n"
else
    echo -e "${BLUE}Setting up environment variables...${NC}"
    
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${YELLOW}Copied .env.example to .env${NC}"
        echo -e "${YELLOW}Please edit .env with your actual configuration:${NC}"
        echo -e "${YELLOW}  - Redis connection details${NC}"
        echo -e "${YELLOW}  - OpenID Connect credentials${NC}"
        echo -e "${YELLOW}  - Session secret${NC}"
        read -p "Press Enter after updating .env: " dummy
    else
        cat > .env << 'EOF'
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# Session Configuration
SESSION_SECRET=your-secret-key-change-this

# OpenID Connect Configuration
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_DISCOVERY_URL=https://your-oidc-provider/.well-known/openid-configuration
OIDC_REDIRECT_URL=http://your-domain.com/auth/callback

# Application Port
PORT=3000
NODE_ENV=production
EOF
        echo -e "${YELLOW}Created .env with default values${NC}"
        echo -e "${YELLOW}Edit .env and add your configuration before starting${NC}"
        read -p "Press Enter after updating .env: " dummy
    fi
    echo ""
fi

# ============================================================================
# 5. Setup Redis (if not running)
# ============================================================================

echo -e "${BLUE}Checking Redis...${NC}"
if ! pgrep -x "redis-server" > /dev/null; then
    echo -e "${YELLOW}Starting Redis...${NC}"
    redis-server --daemonize yes
    sleep 2
    echo -e "${GREEN}✓ Redis started${NC}"
else
    echo -e "${GREEN}✓ Redis is already running${NC}"
fi
echo ""

# ============================================================================
# 6. Option to use Docker or Direct Start
# ============================================================================

read -p "Use Docker? (y/n, default: n): " USE_DOCKER

if [ "$USE_DOCKER" = "y" ] || [ "$USE_DOCKER" = "Y" ]; then
    # Check for Docker
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Docker not found. Exiting.${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}Building Docker image...${NC}"
    docker build -t c_box .
    
    echo -e "${BLUE}Starting Docker container...${NC}"
    docker run -d \
        --name c_box \
        -p 3000:3000 \
        --env-file .env \
        c_box
    
    echo -e "${GREEN}✓ Docker container started${NC}"
else
    echo -e "${BLUE}Starting application directly...${NC}"
    pnpm start &
    APP_PID=$!
    echo -e "${GREEN}✓ Application started (PID: $APP_PID)${NC}"
fi

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Deployment Complete! 🎉${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo -e "${BLUE}Application is running on:${NC}"
echo -e "  ${YELLOW}http://localhost:3000${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Configure your domain/SSL"
echo -e "  2. Setup a process manager (systemd, pm2, supervisor)"
echo -e "  3. Configure firewall rules"
echo ""
