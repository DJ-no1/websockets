#!/bin/bash

# ============================================================================
# C Box - Systemd Service Installation Script
# ============================================================================
# This script sets up the C Box application as a systemd service
# Run this AFTER deploy.sh has completed
# ============================================================================

set -e

echo "Installing C Box as a systemd service..."

# Variables
APP_USER="c_box"
APP_DIR="/home/$APP_USER/c_box"
SERVICE_NAME="c_box"

# ============================================================================
# 1. Create system user (if not exists)
# ============================================================================

echo "Creating system user..."
if ! id -u "$APP_USER" > /dev/null 2>&1; then
    sudo useradd -m -s /bin/bash -d "/home/$APP_USER" "$APP_USER"
    echo "✓ User $APP_USER created"
else
    echo "✓ User $APP_USER already exists"
fi

# ============================================================================
# 2. Set permissions
# ============================================================================

echo "Setting permissions..."
sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"
sudo chmod -R 755 "$APP_DIR"

# ============================================================================
# 3. Install systemd service
# ============================================================================

echo "Installing systemd service..."
sudo cp "$APP_DIR/c_box.service" "/etc/systemd/system/$SERVICE_NAME.service"
sudo systemctl daemon-reload
echo "✓ Service installed"

# ============================================================================
# 4. Start service
# ============================================================================

echo "Starting service..."
sudo systemctl start "$SERVICE_NAME"
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl status "$SERVICE_NAME"

echo ""
echo "================================"
echo "Service installed successfully! 🎉"
echo "================================"
echo ""
echo "Useful commands:"
echo "  systemctl start c_box       - Start the service"
echo "  systemctl stop c_box        - Stop the service"
echo "  systemctl restart c_box     - Restart the service"
echo "  systemctl status c_box      - Check service status"
echo "  journalctl -u c_box -f      - View live logs"
echo ""
