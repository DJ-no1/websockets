# VPS Deployment Guide for C Box

## Quick Start - One Command Deployment

### Option 1: Direct from GitHub (Recommended)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/YOUR-USERNAME/c_box/main/deploy.sh)
```

Replace `YOUR-USERNAME` with your GitHub username and repository path.

### Option 2: Manual Clone First

```bash
# Clone the repository
git clone https://github.com/YOUR-USERNAME/c_box.git
cd c_box

# Run the deployment script
bash deploy.sh
```

---

## What the Deployment Script Does

The `deploy.sh` script automates:

1. ✅ **Repository Cloning** - Clones your project from GitHub
2. ✅ **System Dependencies** - Installs Node.js, Redis, and pnpm
3. ✅ **Project Dependencies** - Installs npm packages with pnpm
4. ✅ **Environment Setup** - Creates `.env` file with required variables
5. ✅ **Redis Startup** - Starts Redis daemon
6. ✅ **Application Start** - Launches your app (Docker or direct)

---

## Configuration

### Environment Variables

After deployment, edit `.env` in your project directory:

```bash
nano .env
```

Required variables:

- **REDIS_HOST** - Redis server address (default: localhost)
- **REDIS_PORT** - Redis port (default: 6379)
- **SESSION_SECRET** - Secure random string (generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- **OIDC_CLIENT_ID** - Your OpenID Connect provider client ID
- **OIDC_CLIENT_SECRET** - Your OpenID Connect provider client secret
- **OIDC_DISCOVERY_URL** - Your OIDC provider's discovery URL
- **OIDC_REDIRECT_URL** - Your app's callback URL (e.g., https://yourdomain.com/auth/callback)
- **PORT** - Application port (default: 3000)
- **NODE_ENV** - Set to "production" for VPS

---

## Persistent Service Setup (Optional)

To run C Box as a systemd service (auto-restart, runs on boot):

```bash
# After deployment, run:
bash install-service.sh
```

This will:
- Create a system user for the app
- Install a systemd service
- Enable auto-start on reboot

### Service Management

```bash
# Start the service
sudo systemctl start c_box

# Stop the service
sudo systemctl stop c_box

# Restart the service
sudo systemctl restart c_box

# Check status
sudo systemctl status c_box

# View live logs
sudo journalctl -u c_box -f

# Disable auto-start
sudo systemctl disable c_box
```

---

## Docker Deployment

If you prefer Docker:

```bash
bash deploy.sh
# When prompted, answer 'y' for Docker option
```

Docker will:
- Build an image with Node.js, Redis, and dependencies
- Run your app in a container on port 3000
- Persist data using volumes

### Docker Management

```bash
# View running containers
docker ps

# View logs
docker logs c_box

# Stop container
docker stop c_box

# Start container
docker start c_box

# Remove container
docker rm c_box
```

---

## SSL/HTTPS Setup

### Using Let's Encrypt with Certbot

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx

sudo certbot certonly --standalone -d yourdomain.com

# Nginx reverse proxy configuration (optional)
# See examples below
```

### Nginx Reverse Proxy

Create `/etc/nginx/sites-available/c_box`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/c_box /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Troubleshooting

### Application won't start

```bash
# Check if port 3000 is in use
sudo lsof -i :3000

# Check logs
sudo journalctl -u c_box -n 50

# Test application directly
pnpm start
```

### Redis connection issues

```bash
# Check Redis status
redis-cli ping
# Should return: PONG

# Restart Redis
sudo systemctl restart redis-server
```

### Environment variables not loading

```bash
# Verify .env file exists
cat .env

# Check for syntax errors
echo $SESSION_SECRET
```

### Port already in use

```bash
# Find process using port 3000
sudo lsof -i :3000

# Kill the process
sudo kill -9 <PID>

# Or change PORT in .env
```

---

## Performance Optimization

### Increase file descriptors

```bash
# Edit /etc/security/limits.conf
sudo nano /etc/security/limits.conf

# Add these lines:
* soft nofile 65536
* hard nofile 65536
```

### Enable compression

The app should handle this, but verify in Nginx/reverse proxy config:

```nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript;
gzip_min_length 1024;
```

### Monitor resource usage

```bash
# Install monitoring tools
sudo apt install htop iotop

# Check system status
htop
```

---

## Backups

### Backup Redis data

```bash
# Manual backup
redis-cli BGSAVE
# Creates dump.rdb in Redis directory

# Copy to safe location
cp /var/lib/redis/dump.rdb /backups/redis-$(date +%Y%m%d).rdb
```

### Backup source code

```bash
# Using git
git clone --mirror https://github.com/YOUR-USERNAME/c_box.git c_box.git

# Or tar archive
tar -czf c_box-backup-$(date +%Y%m%d).tar.gz /home/c_box/c_box/
```

---

## Updating Your Application

```bash
# Pull latest changes
cd /home/c_box/c_box
git pull origin main

# Update dependencies
pnpm install

# Restart the service
sudo systemctl restart c_box
```

---

## Additional Resources

- [Node.js Documentation](https://nodejs.org/docs/)
- [Express Documentation](https://expressjs.com/)
- [Socket.IO Documentation](https://socket.io/docs/)
- [Redis Documentation](https://redis.io/documentation)
- [Systemd Documentation](https://wiki.archlinux.org/title/systemd)

---

## Support

For issues or questions:
- Check application logs: `sudo journalctl -u c_box -f`
- Review deployment script: `cat deploy.sh`
- Check environment configuration: `cat .env`

