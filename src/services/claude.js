'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_STDERR = 10_000; // 10KB cap
const PROCESS_TIMEOUT = parseInt(process.env.PROCESS_TIMEOUT, 10) || 900_000; // 15 min default
const WINDOWS_DIR = process.env.WINDOWS_DIR || '/tmp/claude-windows';
const CONFIG_DIR = process.env.CONFIG_DIR || '/home/node/.claude';
const REAL_HOME = process.env.REAL_HOME || '/home/node';

function buildSafeEnv(home) {
  // Inherit full environment but remove vars that could interfere with Claude CLI.
  // CLAUDECODE env var would prevent CLI from launching ("nested session" check).
  const env = { ...process.env, HOME: home };
  delete env.CLAUDECODE;
  // Remove k8s service discovery vars that look like Claude-related config
  for (const key of Object.keys(env)) {
    if (key.startsWith('CLAUDE_CODE_') && key.includes('SERVICE')) delete env[key];
    if (key.startsWith('CLAUDE_CODE_PORT')) delete env[key];
  }
  return env;
}

function createWindow() {
  if (!fs.existsSync(CONFIG_DIR)) {
    throw new Error(`CONFIG_DIR does not exist: ${CONFIG_DIR}`);
  }

  const id = crypto.randomUUID();
  const windowHome = path.join(WINDOWS_DIR, `claude-${id}`);
  fs.mkdirSync(windowHome, { recursive: true });

  try {
    fs.symlinkSync(CONFIG_DIR, path.join(windowHome, '.claude'));

    // CLI also needs $HOME/.claude.json for credentials and feature flags
    const claudeJson = path.join(REAL_HOME, '.claude.json');
    if (fs.existsSync(claudeJson)) {
      fs.symlinkSync(claudeJson, path.join(windowHome, '.claude.json'));
    }
  } catch (err) {
    destroyWindow(windowHome);
    throw new Error(`Failed to create window symlinks: ${err.message}`);
  }

  return windowHome;
}

function destroyWindow(windowHome) {
  try {
    fs.rmSync(windowHome, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup — /tmp is cleared on container restart
  }
}

function buildArgs({ prompt, allowedTools, maxTurns, agent, systemPrompt, model, permissionMode, resume, stream, jsonSchema }) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt is required and must be a string');
  }

  const resolvedSystemPrompt = jsonSchema
    ? `You MUST respond with ONLY valid JSON that matches this JSON Schema. No other text, no markdown, no explanation.\nJSON Schema: ${JSON.stringify(jsonSchema)}${systemPrompt ? `\n\n${systemPrompt}` : ''}`
    : systemPrompt;

  const args = ['-p', '--output-format', stream ? 'stream-json' : 'json'];
  if (stream) args.push('--verbose');
  args.push('--dangerously-skip-permissions');

  if (resume) args.push('--resume', resume);
  if (maxTurns) args.push('--max-turns', String(maxTurns));
  if (agent) args.push('--agent', agent);
  if (resolvedSystemPrompt) args.push('--system-prompt', resolvedSystemPrompt);
  if (model) args.push('--model', model);
  if (permissionMode) args.push('--permission-mode', permissionMode);

  if (allowedTools) {
    args.push('--allowed-tools', ...allowedTools);
  }

  // -- signals end of options, prompt is treated as positional arg
  args.push('--', prompt);
  return args;
}

function capStderr(current, chunk) {
  const combined = current + chunk.toString();
  return combined.length > MAX_STDERR ? combined.slice(-MAX_STDERR) : combined;
}

function runClaude({ prompt, allowedTools, maxTurns, cwd, agent, systemPrompt, model, permissionMode, resume, jsonSchema }) {
  // Validate before allocating resources
  const args = buildArgs({ prompt, allowedTools, maxTurns, agent, systemPrompt, model, permissionMode, resume, stream: false, jsonSchema });
  const windowHome = createWindow();

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', args, {
      cwd: cwd || '/workspace',
      env: buildSafeEnv(windowHome),
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: PROCESS_TIMEOUT,
    });

    // Close stdin immediately — Claude CLI blocks on open stdin
    proc.stdin.end();

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr = capStderr(stderr, data); });

    proc.on('close', (code) => {
      destroyWindow(windowHome);
      if (code !== 0) {
        reject(new Error(`claude exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (parseErr) {
        reject(new Error(`claude returned invalid JSON: ${parseErr.message}`));
      }
    });

    proc.on('error', (err) => {
      destroyWindow(windowHome);
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });
  });
}

function runClaudeStream({ prompt, allowedTools, maxTurns, cwd, agent, systemPrompt, model, permissionMode, resume, jsonSchema }, reply) {
  // Validate before allocating resources
  const args = buildArgs({ prompt, allowedTools, maxTurns, agent, systemPrompt, model, permissionMode, resume, stream: true, jsonSchema });
  const windowHome = createWindow();

  const proc = spawn('claude', args, {
    cwd: cwd || '/workspace',
    env: buildSafeEnv(windowHome),
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Close stdin immediately — Claude CLI blocks on open stdin
  proc.stdin.end();

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Content-Type-Options': 'nosniff',
  });

  let buffer = '';
  let streamEnded = false;

  proc.stdout.on('data', (chunk) => {
    if (streamEnded) return;
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.trim()) {
        reply.raw.write(`data: ${line}\n\n`);
      }
    }
  });

  proc.stderr.on('data', (data) => {
    if (streamEnded) return;
    reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: data.toString().slice(0, MAX_STDERR) })}\n\n`);
  });

  proc.on('close', (code) => {
    destroyWindow(windowHome);
    if (streamEnded) return;
    streamEnded = true;
    if (buffer.trim()) {
      reply.raw.write(`data: ${buffer.trim()}\n\n`);
    }
    reply.raw.write(`event: done\ndata: ${JSON.stringify({ code })}\n\n`);
    reply.raw.end();
  });

  proc.on('error', (err) => {
    destroyWindow(windowHome);
    if (streamEnded) return;
    streamEnded = true;
    reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    reply.raw.end();
  });

  reply.raw.on('close', () => {
    streamEnded = true;
    if (!proc.killed) {
      proc.kill('SIGTERM');
    }
  });

  return proc;
}

module.exports = { runClaude, runClaudeStream };
