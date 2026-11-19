# Backend image contains application code only, no local .env or research data.
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
USER node
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["node","src/server.js"]
