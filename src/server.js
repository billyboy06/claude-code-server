'use strict';

const Fastify = require('fastify');
const { Semaphore } = require('./lib/semaphore');

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  console.error('API_KEY environment variable is required');
  process.exit(1);
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY environment variable is required');
  process.exit(1);
}

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT, 10) || 3;
const QUEUE_TIMEOUT = parseInt(process.env.QUEUE_TIMEOUT, 10) || 30_000;

const app = Fastify({
  logger: true,
  requestTimeout: 300_000,
  bodyLimit: 1_048_576,
  genReqId: (req) => req.headers['x-request-id'] || require('node:crypto').randomUUID(),
});

// Expose semaphore on the fastify instance for routes
const semaphore = new Semaphore(MAX_CONCURRENT, QUEUE_TIMEOUT);
app.decorate('semaphore', semaphore);

// Echo X-Request-Id in responses
app.addHook('onSend', async (request, reply) => {
  reply.header('x-request-id', request.id);
});

// Plugins
app.register(require('@fastify/helmet'), {
  contentSecurityPolicy: false,
  hsts: { maxAge: 31536000 },
  frameguard: { action: 'deny' },
});
app.register(require('./plugins/auth'));
app.register(require('@fastify/rate-limit'), { global: false });

// Routes
app.register(require('./routes/health'));
app.register(require('./routes/ask'));
app.register(require('./routes/config'));

// Error handler
app.setErrorHandler((error, request, reply) => {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    app.log.error(error);
    reply.code(statusCode).send({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId: request.id },
    });
  } else {
    reply.code(statusCode).send({
      error: { code: 'REQUEST_ERROR', message: error.message, requestId: request.id },
    });
  }
});

app.listen({ port: 3000, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
