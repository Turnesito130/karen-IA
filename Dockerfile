FROM node:22-alpine
ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0
ENV KAREN_SYNC_FILE=/data/memory-vault.json
WORKDIR /app
COPY server/memory-sync-server.mjs ./server/memory-sync-server.mjs
RUN mkdir -p /data && chown -R node:node /app /data
USER node
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "server/memory-sync-server.mjs"]
