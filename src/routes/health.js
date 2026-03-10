'use strict';

const { version } = require('../../package.json');

module.exports = async function healthRoutes(fastify) {
  fastify.get('/health', async () => ({
    status: 'ok',
    version,
    concurrency: {
      active: fastify.semaphore.active,
      max: fastify.semaphore.max,
      queued: fastify.semaphore.queued,
    },
  }));
};
