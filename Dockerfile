FROM node:20.19.5

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Install Chromium and create chromium-browser symlink
RUN apt-get update && apt-get install -y chromium \
    && ln -s /usr/bin/chromium /usr/bin/chromium-browser \
    && rm -rf /var/lib/apt/lists/*

RUN npm run build

EXPOSE 8080

CMD ["npm", "run", "start"]
