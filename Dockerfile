FROM node:22-slim

RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app
COPY package.json ./
RUN npm ci --production
COPY server.js ./

RUN groupadd -g 1000 claude && useradd -u 1000 -g claude -m claude

USER 1000
EXPOSE 3000

CMD ["node", "server.js"]
