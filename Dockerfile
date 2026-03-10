FROM node:22-slim

RUN npm install -g @anthropic-ai/claude-code

ENV HOME=/home/node

RUN mkdir -p /home/node/.claude/agents /home/node/.claude/skills /home/node/.claude/rules \
    && chown -R node:node /home/node

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src/ ./src/

USER node
EXPOSE 3000

CMD ["node", "src/server.js"]
