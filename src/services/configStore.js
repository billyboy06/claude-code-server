'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const CONFIG_DIR = process.env.CONFIG_DIR || '/home/node/.claude';

const TYPE_MAP = {
  agents: { dir: 'agents', filePattern: (name) => `${name}.md` },
  skills: { dir: 'skills', filePattern: (name) => path.join(name, 'SKILL.md') },
  rules: { dir: 'rules', filePattern: (name) => `${name}.md` },
};

function extractDescription(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const descMatch = match[1].match(/^description:\s*(.+)$/m);
  return descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, '') : null;
}

async function list(type) {
  const config = TYPE_MAP[type];
  if (!config) throw new Error(`Unknown config type: ${type}`);

  const dir = path.join(CONFIG_DIR, config.dir);

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const items = [];
  for (const entry of entries) {
    const name = type === 'skills' ? entry.name : entry.name.replace(/\.md$/, '');
    if (type === 'skills' && !entry.isDirectory()) continue;
    if (type !== 'skills' && !entry.name.endsWith('.md')) continue;

    let description = null;
    try {
      const filePath = path.join(dir, config.filePattern(name));
      const content = await fs.readFile(filePath, 'utf-8');
      description = extractDescription(content);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    items.push({ name, description });
  }
  return items;
}

async function get(type, name) {
  const config = TYPE_MAP[type];
  if (!config) throw new Error(`Unknown config type: ${type}`);

  const filePath = path.join(CONFIG_DIR, config.dir, config.filePattern(name));
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { name, content };
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function put(type, name, content) {
  const config = TYPE_MAP[type];
  if (!config) throw new Error(`Unknown config type: ${type}`);

  const filePath = path.join(CONFIG_DIR, config.dir, config.filePattern(name));
  const dir = path.dirname(filePath);

  let existed;
  try {
    await fs.access(filePath);
    existed = true;
  } catch {
    existed = false;
  }

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
  return { created: !existed };
}

async function remove(type, name) {
  const config = TYPE_MAP[type];
  if (!config) throw new Error(`Unknown config type: ${type}`);

  const targetPath = path.join(CONFIG_DIR, config.dir, type === 'skills' ? name : config.filePattern(name));

  try {
    await fs.rm(targetPath, { recursive: true });
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

async function getClaudeMd() {
  const filePath = path.join(CONFIG_DIR, 'CLAUDE.md');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { content };
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function putClaudeMd(content) {
  const filePath = path.join(CONFIG_DIR, 'CLAUDE.md');

  let existed;
  try {
    await fs.access(filePath);
    existed = true;
  } catch {
    existed = false;
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
  return { created: !existed };
}

module.exports = { list, get, put, remove, getClaudeMd, putClaudeMd };
