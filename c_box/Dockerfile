FROM node:20-alpine

# Install Redis
RUN apk add --no-cache redis

WORKDIR /app

# Install pnpm and then install dependencies
COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install

# Copy application files
COPY . .

# Ensure start script is executable
RUN chmod +x start.sh

# Expose the application port
EXPOSE 3000

# Run the startup script
CMD ["./start.sh"]
