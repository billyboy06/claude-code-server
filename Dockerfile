FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends jq git \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

ENV HOME=/home/node

RUN mkdir -p /home/node/.claude/agents /home/node/.claude/skills /home/node/.claude/rules /home/node/.claude/hooks \
    /workspace \
    && chown -R node:node /home/node /workspace

COPY --chown=node:node claude-config/settings.json /home/node/.claude/settings.json
COPY --chown=node:node claude-config/hooks/pre-tool-use.sh /home/node/.claude/hooks/pre-tool-use.sh
RUN chmod +x /home/node/.claude/hooks/pre-tool-use.sh

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src/ ./src/

USER node
EXPOSE 3000

CMD ["node", "src/server.js"]
