'use strict';

const fs = require('node:fs');
const path = require('node:path');

const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_NAME_LENGTH = 60;
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/workspace';

function validateName(name) {
  if (!name || typeof name !== 'string') return 'name is required';
  if (name.includes('\x00')) return 'name contains null bytes';
  if (name.length > MAX_NAME_LENGTH) return `name exceeds ${MAX_NAME_LENGTH} characters`;
  if (!KEBAB_RE.test(name)) return 'name must be kebab-case (lowercase alphanumeric and hyphens)';
  return null;
}

function resolveSafeCwd(userCwd) {
  if (!userCwd) return WORKSPACE_DIR;

  // Resolve the workspace dir to its real path (follows symlinks)
  let realWorkspace;
  try {
    realWorkspace = fs.realpathSync(WORKSPACE_DIR);
  } catch {
    return null; // workspace doesn't exist
  }

  const resolved = path.resolve(realWorkspace, userCwd);

  // Check the resolved path is within workspace before realpath
  if (!resolved.startsWith(realWorkspace + path.sep) && resolved !== realWorkspace) {
    return null;
  }

  // Also check after symlink resolution if the target exists
  try {
    const realResolved = fs.realpathSync(resolved);
    if (!realResolved.startsWith(realWorkspace + path.sep) && realResolved !== realWorkspace) {
      return null;
    }
    return realResolved;
  } catch {
    // Target doesn't exist yet — use the pre-realpath resolved value
    // which was already validated against workspace
    return resolved;
  }
}

module.exports = { validateName, resolveSafeCwd, WORKSPACE_DIR };
