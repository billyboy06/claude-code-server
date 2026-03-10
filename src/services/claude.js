'use strict';

const { spawn } = require('node:child_process');

const MAX_STDERR = 10_000; // 10KB cap

const SAFE_ENV = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  NODE_ENV: process.env.NODE_ENV,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
};

function buildArgs({ prompt, allowedTools, maxTurns, agent, systemPrompt, model, permissionMode, stream }) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('prompt is required and must be a string');
  }

  const args = ['-p', '--output-format', stream ? 'stream-json' : 'json'];

  if (maxTurns) args.push('--max-turns', String(maxTurns));
  if (agent) args.push('--agent', agent);
  if (systemPrompt) args.push('--system-prompt', systemPrompt);
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

function runClaude({ prompt, allowedTools, maxTurns, cwd, agent, systemPrompt, model, permissionMode }) {
  return new Promise((resolve, reject) => {
    const args = buildArgs({ prompt, allowedTools, maxTurns, agent, systemPrompt, model, permissionMode, stream: false });

    const proc = spawn('claude', args, {
      cwd: cwd || '/workspace',
      env: SAFE_ENV,
      timeout: 290_000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr = capStderr(stderr, data); });

    proc.on('close', (code) => {
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
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });
  });
}

function runClaudeStream({ prompt, allowedTools, maxTurns, cwd, agent, systemPrompt, model, permissionMode }, reply) {
  const args = buildArgs({ prompt, allowedTools, maxTurns, agent, systemPrompt, model, permissionMode, stream: true });

  const proc = spawn('claude', args, {
    cwd: cwd || '/workspace',
    env: SAFE_ENV,
  });

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Content-Type-Options': 'nosniff',
  });

  let buffer = '';

  proc.stdout.on('data', (chunk) => {
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
    reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: data.toString().slice(0, MAX_STDERR) })}\n\n`);
  });

  proc.on('close', (code) => {
    if (buffer.trim()) {
      reply.raw.write(`data: ${buffer.trim()}\n\n`);
    }
    reply.raw.write(`event: done\ndata: ${JSON.stringify({ code })}\n\n`);
    reply.raw.end();
  });

  proc.on('error', (err) => {
    reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    reply.raw.end();
  });

  reply.raw.on('close', () => {
    if (!proc.killed) {
      proc.kill('SIGTERM');
    }
  });

  return proc;
}

module.exports = { runClaude, runClaudeStream };
