FROM node:22-bookworm-slim AS node

FROM erlang:29-slim
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
RUN apt-get update && apt-get install -y --no-install-recommends git ripgrep python3 ca-certificates && rm -rf /var/lib/apt/lists/*
RUN for n in 1 2 3 4 5; do useradd -m -u 100$n -s /bin/sh agent$n && chmod 700 /home/agent$n; done
WORKDIR /opt/pi-env
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund --registry=https://registry.npmjs.org/
COPY env-server.mjs ./
COPY beam/build/erlang-shipment /opt/beam-fleet
RUN mkdir -p /workspace
ENV PI_ENV_ROOT=/workspace PI_ENV_PORT=8080 BEAM_SEATS=5 BEAM_CONTROL_PORT=8090
EXPOSE 8080 8081 8082 8083 8084 8085 8090
CMD ["/opt/beam-fleet/entrypoint.sh", "run"]
