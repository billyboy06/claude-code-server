'use strict';

const crypto = require('node:crypto');
const fp = require('fastify-plugin');

function authPlugin(fastify, opts, done) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error('API_KEY environment variable is required for auth plugin');
  const apiKeyBuf = Buffer.from(apiKey);

  fastify.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health') return;
    const key = request.headers['x-api-key'] || '';
    const keyBuf = Buffer.from(key);

    if (keyBuf.length !== apiKeyBuf.length || !crypto.timingSafeEqual(keyBuf, apiKeyBuf)) {
      reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or missing API key', requestId: request.id },
      });
      return;
    }
  });

  done();
}

module.exports = fp(authPlugin, { name: 'auth' });
