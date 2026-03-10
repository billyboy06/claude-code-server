# claude-code-server

Production-ready HTTP API server for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI. Exposes Claude's agentic coding capabilities as a secure REST API with streaming, configuration management, and bounded concurrency.

[![CI](https://github.com/billyboy06/claude-code-server/actions/workflows/build.yml/badge.svg)](https://github.com/billyboy06/claude-code-server/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Node.js](https://img.shields.io/badge/Node.js-22-green)
![Fastify](https://img.shields.io/badge/Fastify-5-black)

## Why?

Claude Code CLI is powerful but limited to terminal usage. This server turns it into a **headless API** you can integrate into CI/CD pipelines, chatbots, internal tools, or any HTTP client — while adding security, concurrency control, and configuration management that the CLI doesn't provide.

### What makes it different

| Feature | claude-code-server | Other wrappers |
|---------|-------------------|----------------|
| Security-first (timing-safe auth, path traversal prevention, helmet headers) | Yes | Rarely |
| Bounded concurrency with queue + timeout | Yes | No |
| SSE streaming | Yes | Some |
| Config management API (agents, skills, rules, CLAUDE.md) | Yes | No |
| Rate limiting per endpoint | Yes | No |
| Production-deployed on Kubernetes | Yes | Varies |

## Architecture

```
Client → [TLS + Basic Auth (Traefik)] → claude-code-server (Fastify)
                                              │
                    ┌─────────────────────────┤
                    │                         │
              POST /ask                 /config/*
                    │                         │
            ┌───────┴───────┐          Config Store
            │  Semaphore    │          (filesystem)
            │  (bounded     │               │
            │  concurrency) │          /home/node/.claude/
            │               │          ├── agents/
            ▼               │          ├── skills/
     spawn claude CLI       │          ├── rules/
     ├── sync (JSON)        │          └── CLAUDE.md
     └── stream (SSE)      │
                            │
                     /workspace/
                     (git repos)
```

## Quick start

### Docker

```bash
docker run -d \
  -e API_KEY=your-secret-key \
  -e ANTHROPIC_API_KEY=your-anthropic-key \
  -p 3000:3000 \
  ghcr.io/billyboy06/claude-code-server:latest
```

### From source

```bash
git clone https://github.com/billyboy06/claude-code-server.git
cd claude-code-server
npm install
API_KEY=your-secret-key node src/server.js
```

> **Prerequisite:** [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) must be installed and configured (`npm install -g @anthropic-ai/claude-code`).

## API reference

### Authentication

All endpoints (except `/health`) require an `x-api-key` header:

```bash
curl -H "x-api-key: $API_KEY" http://localhost:3000/config/agents
```

### `GET /health`

Returns server status and concurrency info.

```json
{
  "status": "ok",
  "version": "0.2.0",
  "concurrency": { "active": 1, "max": 3, "queued": 0 }
}
```

### `POST /ask`

Send a prompt to Claude Code.

```bash
curl -X POST http://localhost:3000/ask \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain the main function in src/server.js",
    "cwd": "my-project",
    "maxTurns": 10
  }'
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | The prompt to send (max 50,000 chars) |
| `cwd` | string | No | Working directory relative to `/workspace` |
| `stream` | boolean | No | Enable SSE streaming (default: false) |
| `maxTurns` | integer | No | Max agentic turns (1-50) |
| `agent` | string | No | Named agent from config |
| `systemPrompt` | string | No | Custom system prompt |
| `model` | string | No | Model selection (`sonnet`, `opus`, `haiku`) |
| `allowedTools` | string[] | No | Restrict available tools |
| `permissionMode` | string | No | Permission mode (`default`, `plan`, `auto`) |

**Streaming (SSE):**

```bash
curl -N -X POST http://localhost:3000/ask \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello", "stream": true}'
```

Events: `data` (JSON chunks), `error`, `done`.

### Configuration management

CRUD API for Claude Code configuration files (agents, skills, rules, CLAUDE.md).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/config/agents` | List agents (paginated) |
| `GET` | `/config/agents/:name` | Get agent content |
| `PUT` | `/config/agents/:name` | Create/update agent |
| `DELETE` | `/config/agents/:name` | Delete agent |
| `GET` | `/config/skills` | List skills (paginated) |
| `GET` | `/config/skills/:name` | Get skill content |
| `PUT` | `/config/skills/:name` | Create/update skill |
| `DELETE` | `/config/skills/:name` | Delete skill |
| `GET` | `/config/rules` | List rules (paginated) |
| `GET` | `/config/rules/:name` | Get rule content |
| `PUT` | `/config/rules/:name` | Create/update rule |
| `DELETE` | `/config/rules/:name` | Delete rule |
| `GET` | `/config/claude-md` | Get CLAUDE.md |
| `PUT` | `/config/claude-md` | Update CLAUDE.md |

**Example — deploy a custom agent:**

```bash
curl -X PUT http://localhost:3000/config/agents/code-reviewer \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "---\nname: code-reviewer\ndescription: Reviews code for quality\n---\n\nYou are an expert code reviewer..."
  }'
```

Then use it:

```bash
curl -X POST http://localhost:3000/ask \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Review src/server.js", "agent": "code-reviewer"}'
```

## Configuration

| Environment variable | Default | Description |
|---------------------|---------|-------------|
| `API_KEY` | — | **Required.** API key for authentication |
| `ANTHROPIC_API_KEY` | — | Anthropic API key (optional if configured in Claude CLI) |
| `MAX_CONCURRENT` | `3` | Max concurrent Claude processes |
| `QUEUE_TIMEOUT` | `30000` | Queue wait timeout in ms (429 after) |
| `CONFIG_DIR` | `/home/node/.claude` | Config files directory |
| `WORKSPACE_DIR` | `/workspace` | Workspace root (cwd is restricted to this) |

## Security

- **Timing-safe** API key comparison (`crypto.timingSafeEqual`)
- **Path traversal prevention** with `realpath` resolution and workspace whitelisting
- **Rate limiting** — 10 req/min on `/ask`, 60 req/min on `/config/*`
- **Security headers** via `@fastify/helmet` (HSTS, X-Frame-Options, CSP, etc.)
- **Environment whitelist** — child processes only see `PATH`, `HOME`, `NODE_ENV`, `ANTHROPIC_API_KEY`
- **Input validation** — JSON schemas on all endpoints, name pattern enforcement
- **Flag injection prevention** — `--` separator before prompt in CLI args
- Non-root container (`USER node`)

## Deployment

### Kubernetes (Helm)

The server is designed for Kubernetes deployment with:
- **PVC** for persistent config at `/home/node/.claude`
- **emptyDir** for workspace at `/workspace` (clone repos via init containers)
- **Ingress** with TLS termination and optional basic auth middleware

### GitHub Actions CI/CD

Automated build and push to GHCR on every push to `main`. See `.github/workflows/build.yml`.

## Project structure

```
src/
├── server.js              # Fastify bootstrap, plugins, routes
├── plugins/
│   └── auth.js            # x-api-key authentication hook
├── routes/
│   ├── health.js          # GET /health
│   ├── ask.js             # POST /ask (sync + SSE streaming)
│   └── config.js          # /config/* CRUD endpoints
├── services/
│   ├── claude.js           # Claude CLI spawn (sync + stream)
│   └── configStore.js     # Filesystem CRUD for .claude/
├── lib/
│   ├── validation.js      # Path safety, name validation
│   └── semaphore.js       # Bounded concurrency queue
└── schemas/
    ├── ask.js             # JSON schema for POST /ask
    └── config.js          # JSON schemas for /config/*
```

## License

[MIT](LICENSE)
