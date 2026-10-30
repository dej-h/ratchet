import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { findRatchetDir } from './session-start.mjs';

const GH_PR_CREATE_RE = /\bgh\s+(?:--?[\w-]+(?:=\S+|\s+\S+)?\s+)*pr\s+create\b/i;

function resolveBaseRef(repoRoot) {
  for (const candidate of ['origin/main', 'origin/master', 'main', 'master']) {
    try {
      execFileSync('git', ['rev-parse', '--verify', candidate], {
        cwd: repoRoot,
        stdio: 'ignore',
      });
      return candidate;
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

/**
 * Evaluate a PreToolUse Bash command.
 * Only gates `gh pr create` inside repositories that contain `.ratchet/work-packages.yaml`.
 */
export function evaluatePreToolUse(hookInput, fallbackCwd = process.cwd()) {
  const command = String(hookInput?.tool_input?.command ?? '');
  if (!command || !GH_PR_CREATE_RE.test(command)) {
    return null;
  }

  const startDir = String(
    hookInput?.cwd || process.env.CLAUDE_PROJECT_DIR || fallbackCwd
  );
  const ratchetDir = findRatchetDir(startDir);
  if (!ratchetDir) {
    return null;
  }
  const repoRoot = path.dirname(ratchetDir);

  try {
    const uncommitted = execFileSync(
      'git',
      ['status', '--porcelain', '--', '.ratchet/work-packages.yaml', '.ratchet/human-dependencies.md'],
      { cwd: repoRoot, encoding: 'utf8' }
    ).trim();
    if (uncommitted) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            'Blocked gh pr create: .ratchet/ has uncommitted changes. Commit and push your updates to .ratchet/work-packages.yaml (and .ratchet/human-dependencies.md if modified) before opening the PR.',
        },
      };
    }

    const baseRef = resolveBaseRef(repoRoot);
    if (baseRef) {
      const changed = execFileSync(
        'git',
        ['diff', '--name-only', `${baseRef}...HEAD`, '--', '.ratchet/work-packages.yaml'],
        { cwd: repoRoot, encoding: 'utf8' }
      ).trim();
      if (!changed) {
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason:
              'Blocked gh pr create: .ratchet/work-packages.yaml was not updated on this branch. Set the delivered work package to status: done in .ratchet/work-packages.yaml (so merging the PR updates main atomically) and commit + push before running gh pr create.',
          },
        };
      }
    }
  } catch {
    return null;
  }

  return null;
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    if (raw.trim()) {
      const parsed = JSON.parse(raw);
      const decision = evaluatePreToolUse(parsed);
      if (decision) {
        process.stdout.write(JSON.stringify(decision));
      }
    }
  } catch {
    // Do not block tool execution on malformed hook stdin.
  }
}
