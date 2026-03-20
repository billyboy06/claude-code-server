# Window Isolation for Parallel Requests

## Problem

When multiple Claude CLI processes run concurrently (up to `MAX_CONCURRENT=3`), they share the same `HOME` directory (`/home/node`). The CLI writes lock files, session state, and cache to `~/.claude/`, creating a risk of collision between parallel processes.

## Solution

Create an ephemeral isolated HOME directory per CLI invocation. The shared `.claude/` config (agents, skills, rules, CLAUDE.md) is accessible via symlink.

## Architecture

```
/tmp/claude-windows/           (WINDOWS_DIR, configurable)
  ├── claude-<uuid-1>/         (ephemeral HOME for request 1)
  │   └── .claude -> /home/node/.claude  (symlink to shared config)
  └── claude-<uuid-2>/         (ephemeral HOME for request 2)
      └── .claude -> /home/node/.claude
```

## Changes

**File: `src/services/claude.js`**

1. Replace static `SAFE_ENV` with a function `buildSafeEnv(home)` that accepts a HOME override
2. Before each `spawn`, create a temp directory and symlink `.claude/`
3. Pass the temp directory as `HOME` in the process env
4. Cleanup (rmSync recursive) in `finally` block after process completes
5. On stream mode: also cleanup on client disconnect (`reply.raw.on('close')`)

**No other files change.** Routes, schemas, semaphore, config store — all untouched.

## Environment Variables

| Var | Default | Purpose |
|-----|---------|---------|
| `WINDOWS_DIR` | `/tmp/claude-windows` | Parent directory for ephemeral HOMEs |

## Cleanup Strategy

- Normal exit: `fs.rmSync(processHome, { recursive: true, force: true })` in finally block
- Client disconnect (stream): kill process + cleanup
- Server crash: `/tmp` cleaned by OS on container restart (acceptable)

## What This Does NOT Include

- No new API endpoints
- No persistent windows
- No window registry or timer-based cleanup
- No changes to `POST /ask` schema

These can be added later if multi-turn `--resume` with isolation becomes a real need.
