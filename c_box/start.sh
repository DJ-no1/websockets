#!/bin/sh

# Start Redis server in the background
echo "Starting Redis..."
redis-server --daemonize yes

# Wait a moment for Redis to initialize
sleep 2

# Start the Node.js application in the foreground
echo "Starting Node app..."
exec node index.js
