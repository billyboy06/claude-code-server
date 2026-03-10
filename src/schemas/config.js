'use strict';

const nameParams = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', pattern: '^[a-z0-9]+(-[a-z0-9]+)*$', maxLength: 60 },
  },
};

const contentBody = {
  type: 'object',
  required: ['content'],
  properties: {
    content: { type: 'string', minLength: 1, maxLength: 500000 },
  },
  additionalProperties: false,
};

const getOneSchema = { params: nameParams };
const putSchema = { params: nameParams, body: contentBody };
const deleteSchema = { params: nameParams };

module.exports = { getOneSchema, putSchema, deleteSchema, contentBody };
