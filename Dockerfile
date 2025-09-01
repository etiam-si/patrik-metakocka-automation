# Use official Node.js LTS image
FROM node:alpine

# Install timezone data
RUN apk add --no-cache tzdata \
    && cp /usr/share/zoneinfo/Europe/Belgrade /etc/localtime \
    && echo "Europe/Belgrade" > /etc/timezone \
    && apk del tzdata

# Set working directory
WORKDIR /usr/src/app

ENV ENV_FILE_PATH=/data/.env
ENV CRON_FILE_PATH=/data/cron.json
ENV TZ=Europe/Belgrade

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy only the public folder
COPY public ./public

# Copy your main server file (index.js)
COPY index.js .
COPY cron.js .
COPY config/ ./config/

# Expose the port
EXPOSE 3000

# Start the server
CMD ["node", "index.js"]
