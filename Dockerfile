FROM node:24.14.0
 
WORKDIR /home/app
 
# Install nginx, redis, pm2
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
    nginx \
    redis-server \
    procps && \
    npm install -g pm2 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
 
# Copy package files and install dependencies
COPY package*.json ./
RUN npm install
 
# Copy project
COPY . .
 
# Build
RUN npm run build
 
# Cleanup
RUN rm -rf src test Dockerfile && \
    echo "Deleted folders: src, test, and Dockerfile only."
 
# Expose ports
EXPOSE 4002 
 
# Start everything
# CMD ["bash", "-lc", "redis-server --daemonize yes && pm2 start npm --name my-app -- run start:prod && nginx -g 'daemon off;'"]

CMD ["sh", "-c", "redis-server --daemonize yes && pm2-runtime ecosystem.config.js"]