'use strict';

const { askSchema } = require('../schemas/ask');
const { runClaude, runClaudeStream } = require('../services/claude');
const { resolveSafeCwd } = require('../lib/validation');
const configStore = require('../services/configStore');

module.exports = async function askRoutes(fastify) {
  fastify.post('/ask', {
    schema: askSchema,
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const { prompt, allowedTools, maxTurns, cwd, stream, agent, systemPrompt, model, permissionMode, resume } = request.body;

    // Validate cwd
    const resolvedCwd = resolveSafeCwd(cwd);
    if (resolvedCwd === null) {
      reply.code(400).send({
        error: { code: 'INVALID_CWD', message: 'cwd must be within the workspace directory', requestId: request.id },
      });
      return;
    }

    // Validate agent exists if specified
    if (agent) {
      const agentConfig = await configStore.get('agents', agent);
      if (!agentConfig) {
        reply.code(400).send({
          error: { code: 'AGENT_NOT_FOUND', message: `Agent '${agent}' not found`, requestId: request.id },
        });
        return;
      }
    }

    // Normalize allowedTools to array
    const normalizedTools = allowedTools
      ? (Array.isArray(allowedTools) ? allowedTools : [allowedTools])
      : undefined;

    const params = { prompt, allowedTools: normalizedTools, maxTurns, cwd: resolvedCwd, agent, systemPrompt, model, permissionMode, resume };

    // Acquire semaphore slot
    try {
      await fastify.semaphore.acquire();
    } catch {
      reply.code(429).send({
        error: { code: 'SERVER_BUSY', message: 'Server is busy, try again later', requestId: request.id },
      });
      return;
    }

    try {
      if (stream) {
        runClaudeStream(params, reply);
        await new Promise((resolve) => reply.raw.on('close', resolve));
      } else {
        const result = await runClaude(params);
        return result;
      }
    } catch (err) {
      if (!stream) throw err;
    } finally {
      fastify.semaphore.release();
    }
  });
};
