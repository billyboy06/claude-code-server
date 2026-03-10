'use strict';

const configStore = require('../services/configStore');
const { getOneSchema, putSchema, deleteSchema, contentBody } = require('../schemas/config');

const RATE_LIMIT_CONFIG = {
  rateLimit: {
    max: 60,
    timeWindow: '1 minute',
  },
};

module.exports = async function configRoutes(fastify) {
  // --- Agents ---
  registerCrudRoutes(fastify, 'agents');

  // --- Skills ---
  registerCrudRoutes(fastify, 'skills');

  // --- Rules ---
  registerCrudRoutes(fastify, 'rules');

  // --- CLAUDE.md ---
  fastify.get('/config/claude-md', { config: RATE_LIMIT_CONFIG }, async (request, reply) => {
    const result = await configStore.getClaudeMd();
    if (!result) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'CLAUDE.md not found', requestId: request.id },
      });
      return;
    }
    return result;
  });

  fastify.put('/config/claude-md', {
    config: RATE_LIMIT_CONFIG,
    schema: { body: contentBody },
  }, async (request, reply) => {
    const { content } = request.body;
    const { created } = await configStore.putClaudeMd(content);
    reply.code(created ? 201 : 200).send({ updated: true });
  });
};

function registerCrudRoutes(fastify, type) {
  const singular = type.slice(0, -1);

  // LIST with pagination
  fastify.get(`/config/${type}`, { config: RATE_LIMIT_CONFIG }, async (request) => {
    const limit = Math.min(parseInt(request.query.limit, 10) || 50, 200);
    const offset = Math.max(parseInt(request.query.offset, 10) || 0, 0);
    const allItems = await configStore.list(type);
    const paged = allItems.slice(offset, offset + limit);
    return {
      items: paged,
      count: paged.length,
      total: allItems.length,
      limit,
      offset,
    };
  });

  // GET one
  fastify.get(`/config/${type}/:name`, {
    config: RATE_LIMIT_CONFIG,
    schema: getOneSchema,
  }, async (request, reply) => {
    const result = await configStore.get(type, request.params.name);
    if (!result) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: `${singular} not found`, requestId: request.id },
      });
      return;
    }
    return result;
  });

  // PUT (create or update)
  fastify.put(`/config/${type}/:name`, {
    config: RATE_LIMIT_CONFIG,
    schema: putSchema,
  }, async (request, reply) => {
    const { content } = request.body;
    const { created } = await configStore.put(type, request.params.name, content);
    reply.code(created ? 201 : 200).send({ name: request.params.name });
  });

  // DELETE
  fastify.delete(`/config/${type}/:name`, {
    config: RATE_LIMIT_CONFIG,
    schema: deleteSchema,
  }, async (request, reply) => {
    const removed = await configStore.remove(type, request.params.name);
    if (!removed) {
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: `${singular} not found`, requestId: request.id },
      });
      return;
    }
    reply.code(204).send();
  });
}
