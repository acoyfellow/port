FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ripgrep python3 ca-certificates && rm -rf /var/lib/apt/lists/*
RUN for n in 1 2 3 4 5; do useradd -m -u 100$n -s /bin/sh agent$n && chmod 700 /home/agent$n; done
WORKDIR /opt/pi-env
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund --registry=https://registry.npmjs.org/
COPY env-server.mjs shared-seats.sh ./
RUN chmod +x shared-seats.sh && mkdir -p /workspace
ENV PI_ENV_ROOT=/workspace PI_ENV_PORT=8080
EXPOSE 8080 8081 8082 8083 8084 8085
CMD ["/opt/pi-env/shared-seats.sh"]
