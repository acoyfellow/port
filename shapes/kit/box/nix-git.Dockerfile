FROM pi-nix-git-box:latest AS nix

FROM node:22-slim
COPY --from=nix /nix /nix
COPY --from=nix /nix-git.json /nix-git.json
COPY --from=nix /opt/pi-env /opt/pi-env
RUN tools=$(node -p 'require("/nix-git.json").tools_store_path') \
 && ln -s "$tools/bin" /opt/nix-bin \
 && mkdir -p /workspace
ENV PATH=/opt/nix-bin:/usr/local/bin:/usr/bin:/bin
WORKDIR /workspace
EXPOSE 8080
CMD ["node", "/opt/pi-env/env-server.mjs"]
