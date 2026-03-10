const Fastify = require('fastify');
const { spawn } = require('child_process');

const app = Fastify({ logger: true, requestTimeout: 300_000 });

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  console.error('API_KEY environment variable is required');
  process.exit(1);
}

let busy = false;

app.addHook('onRequest', async (request, reply) => {
  if (request.url === '/health') return;
  const key = request.headers['x-api-key'];
  if (key !== API_KEY) {
    reply.code(401).send({ error: 'Invalid or missing API key' });
  }
});

app.get('/health', async () => ({ status: 'ok' }));

app.post('/ask', async (request, reply) => {
  if (busy) {
    reply.code(429).send({ error: 'Server is busy, try again later' });
    return;
  }

  const { prompt, allowedTools, maxTurns, cwd } = request.body || {};

  if (!prompt) {
    reply.code(400).send({ error: 'prompt is required' });
    return;
  }

  busy = true;

  try {
    const result = await runClaude({ prompt, allowedTools, maxTurns, cwd });
    return result;
  } finally {
    busy = false;
  }
});

function runClaude({ prompt, allowedTools, maxTurns, cwd }) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'json'];

    if (maxTurns) {
      args.push('--max-turns', String(maxTurns));
    }
    if (allowedTools) {
      args.push('--allowedTools', allowedTools);
    }

    args.push(prompt);

    const proc = spawn('claude', args, {
      cwd: cwd || '/workspace',
      env: { ...process.env },
      timeout: 290_000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`claude exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve({ raw: stdout });
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });
  });
}

app.setErrorHandler((error, request, reply) => {
  app.log.error(error);
  reply.code(500).send({ error: error.message });
});

app.listen({ port: 3000, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
