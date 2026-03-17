'use strict';

const askSchema = {
  body: {
    type: 'object',
    required: ['prompt'],
    properties: {
      prompt: { type: 'string', minLength: 1, maxLength: 50000 },
      allowedTools: {
        oneOf: [
          { type: 'array', items: { type: 'string' } },
          { type: 'string' },
        ],
      },
      maxTurns: { type: 'integer', minimum: 1, maximum: 50 },
      cwd: { type: 'string' },
      stream: { type: 'boolean', default: false },
      agent: { type: 'string', minLength: 1, maxLength: 60, pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' },
      systemPrompt: { type: 'string', maxLength: 50000 },
      model: { type: 'string', enum: ['sonnet', 'opus', 'haiku'] },
      permissionMode: { type: 'string', enum: ['default', 'plan', 'auto', 'acceptEdits', 'dontAsk'] },
      resume: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' },
      jsonSchema: { type: 'object', description: 'JSON Schema for structured output. When provided, Claude will return valid JSON matching this schema.' },
    },
    additionalProperties: false,
  },
};

module.exports = { askSchema };
