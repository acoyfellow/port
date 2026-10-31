FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ripgrep python3 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/pi-env
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund --registry=https://registry.npmjs.org/
COPY env-server.mjs ./
RUN mkdir -p /workspace
ENV PI_ENV_ROOT=/workspace PI_ENV_PORT=8080
EXPOSE 8080
CMD ["node", "/opt/pi-env/env-server.mjs"]
