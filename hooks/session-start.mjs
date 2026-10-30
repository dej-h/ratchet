import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const WORK_PACKAGES_FILE = 'work-packages.yaml';
const HUMAN_DEPS_FILE = 'human-dependencies.md';

/**
 * Walk upward from startDir looking for `.ratchet/work-packages.yaml`.
 * Returns the `.ratchet` directory path, or null when absent.
 */
export function findRatchetDir(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, '.ratchet');
    const wpPath = path.join(candidate, WORK_PACKAGES_FILE);
    if (fs.existsSync(wpPath) && fs.statSync(wpPath).isFile()) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function stripScalar(raw) {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseListValue(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return [];
  }
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) {
    return [];
  }
  return inner
    .split(',')
    .map((item) => stripScalar(item))
    .filter(Boolean);
}

function splitTopLevelFields(flowContent) {
  const fields = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < flowContent.length; i += 1) {
    const ch = flowContent[i];
    if (quote) {
      if (ch === quote && flowContent[i - 1] !== '\\') {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '[' || ch === '{') {
      depth += 1;
    } else if (ch === ']' || ch === '}') {
      depth -= 1;
    } else if (
      ch === ',' &&
      depth === 0 &&
      /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*:/.test(flowContent.slice(i + 1))
    ) {
      fields.push(flowContent.slice(start, i));
      start = i + 1;
    }
  }
  fields.push(flowContent.slice(start));
  return fields;
}

function stripTrailingComment(rawLine) {
  let quote = null;
  let braceDepth = 0;
  for (let i = 0; i < rawLine.length; i += 1) {
    const ch = rawLine[i];
    if (quote) {
      if (ch === quote && rawLine[i - 1] !== '\\') {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '{' || ch === '[') {
      braceDepth += 1;
    } else if (ch === '}' || ch === ']') {
      braceDepth = Math.max(0, braceDepth - 1);
    } else if (
      ch === '#' &&
      braceDepth === 0 &&
      (i === 0 || /\s/.test(rawLine[i - 1]))
    ) {
      return rawLine.slice(0, i);
    }
  }
  return rawLine;
}

function normalizeWorkPackage(rawObj) {
  return {
    id: String(rawObj.id ?? ''),
    lane: String(rawObj.lane ?? 'default'),
    title: String(rawObj.title ?? ''),
    depends_on: Array.isArray(rawObj.depends_on) ? rawObj.depends_on : [],
    blocked_by: Array.isArray(rawObj.blocked_by) ? rawObj.blocked_by : [],
    human_gate: rawObj.human_gate === true || rawObj.human_gate === 'true',
    status: String(rawObj.status ?? 'todo'),
    owner:
      rawObj.owner && rawObj.owner !== 'null' ? String(rawObj.owner) : null,
  };
}

function parseFlowMapping(flowText) {
  const inner = flowText.trim().replace(/^\{/, '').replace(/\}$/, '');
  const obj = {};
  for (const part of splitTopLevelFields(inner)) {
    const colonIndex = part.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }
    const key = part.slice(0, colonIndex).trim();
    const rawVal = part.slice(colonIndex + 1).trim();
    if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      obj[key] = parseListValue(rawVal);
    } else if (rawVal === 'true' || rawVal === 'false') {
      obj[key] = rawVal === 'true';
    } else if (rawVal === 'null' || rawVal === '~' || rawVal === '') {
      obj[key] = null;
    } else {
      obj[key] = stripScalar(rawVal);
    }
  }
  return normalizeWorkPackage(obj);
}

/**
 * Parse `.ratchet/work-packages.yaml` without external dependencies.
 * Supports flow-mapping items (`- { id: WP-1.1, ... }`) and block items.
 */
export function parseWorkPackages(yamlText) {
  const items = [];
  let inWorkPackages = false;
  let currentBlock = null;

  for (const rawLine of yamlText.split(/\r?\n/)) {
    const line = stripTrailingComment(rawLine);
    if (!line.trim()) {
      continue;
    }

    if (/^work_packages\s*:/.test(line.trim()) && !line.startsWith(' ')) {
      inWorkPackages = true;
      continue;
    }
    if (!line.startsWith(' ') && !line.startsWith('-') && line.includes(':')) {
      if (currentBlock) {
        items.push(normalizeWorkPackage(currentBlock));
        currentBlock = null;
      }
      inWorkPackages = false;
      continue;
    }
    if (!inWorkPackages) {
      continue;
    }

    const trimmed = line.trim();
    if (trimmed.startsWith('-')) {
      if (currentBlock) {
        items.push(normalizeWorkPackage(currentBlock));
        currentBlock = null;
      }
      const afterDash = trimmed.slice(1).trim();
      if (afterDash.startsWith('{') && afterDash.endsWith('}')) {
        items.push(parseFlowMapping(afterDash));
      } else if (afterDash.includes(':')) {
        currentBlock = {};
        const colon = afterDash.indexOf(':');
        const key = afterDash.slice(0, colon).trim();
        const val = afterDash.slice(colon + 1).trim();
        currentBlock[key] = val.startsWith('[')
          ? parseListValue(val)
          : stripScalar(val);
      }
    } else if (currentBlock && trimmed.includes(':')) {
      const colon = trimmed.indexOf(':');
      const key = trimmed.slice(0, colon).trim();
      const val = trimmed.slice(colon + 1).trim();
      currentBlock[key] = val.startsWith('[')
        ? parseListValue(val)
        : stripScalar(val);
    }
  }

  if (currentBlock) {
    items.push(normalizeWorkPackage(currentBlock));
  }
  return items.filter((item) => item.id);
}

/**
 * Parse `.ratchet/human-dependencies.md` Markdown table rows keyed by ID (`HD-xx` / `Q-xx`).
 */
export function parseHumanDependencies(markdownText) {
  const deps = new Map();
  if (!markdownText) {
    return deps;
  }
  const lines = markdownText.split(/\r?\n/);
  let headers = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
      continue;
    }
    const cells = trimmed
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim());
    if (cells.every((c) => /^[-:]+$/.test(c))) {
      continue;
    }
    if (!headers) {
      headers = cells.map((h) => h.toLowerCase());
      continue;
    }
    const idIndex = headers.findIndex((h) => h === 'id');
    if (idIndex === -1 || !cells[idIndex]) {
      continue;
    }
    const id = cells[idIndex].replace(/`/g, '').trim();
    const whatIndex = headers.findIndex(
      (h) => h.startsWith('what') || h.startsWith('question')
    );
    const unblockIndex = headers.findIndex((h) => h.startsWith('unblock'));
    const statusIndex = headers.findIndex((h) => h.startsWith('status'));

    deps.set(id, {
      id,
      what: whatIndex !== -1 ? cells[whatIndex] ?? '' : '',
      unblockWith: unblockIndex !== -1 ? cells[unblockIndex] ?? '' : '',
      status: statusIndex !== -1 ? cells[statusIndex] ?? '' : 'Open',
    });
  }
  return deps;
}

function isDependencyDone(depStatus) {
  return /^done\b/i.test(String(depStatus ?? '').trim());
}

/**
 * Extract all `#<number>` references mentioned in `.ratchet/` files.
 */
export function extractReferencedNumbers(yamlText, hdText = '') {
  const refs = new Set();
  const combined = `${yamlText}\n${hdText}`;
  for (const match of combined.matchAll(/#(\d+)\b/g)) {
    refs.add(Number(match[1]));
  }
  return refs;
}

function fetchOpenGitHubIssues(repoRoot) {
  if (process.env.RATCHET_SKIP_GH_ISSUES === '1') {
    return [];
  }
  if (process.env.RATCHET_MOCK_GH_ISSUES_JSON) {
    try {
      return JSON.parse(process.env.RATCHET_MOCK_GH_ISSUES_JSON);
    } catch {
      return [];
    }
  }
  try {
    const raw = execFileSync(
      'gh',
      ['issue', 'list', '--state', 'open', '--limit', '50', '--json', 'number,title'],
      { cwd: repoRoot, encoding: 'utf8', timeout: 2500, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Build the compact `<ratchet-work-packages>` briefing injected at session start.
 */
export function buildBriefing(
  ratchetDir,
  workPackages,
  humanDeps,
  untrackedIssues = []
) {
  if (!workPackages.length && !untrackedIssues.length) {
    return '';
  }
  const doneIds = new Set(
    workPackages.filter((wp) => wp.status === 'done').map((wp) => wp.id)
  );
  const active = workPackages.filter((wp) =>
    ['claimed', 'in_progress', 'in_review'].includes(wp.status)
  );
  const ready = workPackages.filter(
    (wp) =>
      wp.status === 'todo' &&
      wp.depends_on.every((depId) => doneIds.has(depId))
  );
  const blocked = workPackages.filter((wp) => wp.status === 'blocked');

  const lines = [
    '<ratchet-work-packages>',
    `Repository work-package ledger loaded from ${path.join(ratchetDir, WORK_PACKAGES_FILE)} (${doneIds.size}/${workPackages.length} done).`,
  ];

  if (untrackedIssues.length) {
    lines.push(
      'Untracked Open GitHub Issues (not yet in .ratchet/work-packages.yaml; triage into a lane when starting work):'
    );
    for (const issue of untrackedIssues) {
      lines.push(`  - #${issue.number}: ${issue.title}`);
    }
  }

  if (active.length) {
    lines.push('Active / In Review:');
    for (const wp of active) {
      const gateTag = wp.human_gate ? ' [human_gate]' : '';
      const ownerTag = wp.owner ? ` (owner: ${wp.owner})` : '';
      lines.push(
        `  - ${wp.id} [${wp.lane}] (${wp.status}): ${wp.title}${gateTag}${ownerTag}`
      );
    }
  }

  if (ready.length) {
    lines.push('Ready Next (all depends_on done):');
    for (const wp of ready) {
      const gateTag = wp.human_gate ? ' [human_gate]' : '';
      const openBlockers = wp.blocked_by
        .map((id) => humanDeps.get(id) ?? { id, unblockWith: '', status: 'Open' })
        .filter((dep) => !isDependencyDone(dep.status));
      const unblockNote = openBlockers.length
        ? ` | Open blockers: ${openBlockers
            .map((d) =>
              d.unblockWith ? `${d.id} (Unblock-with: ${d.unblockWith})` : d.id
            )
            .join('; ')}`
        : '';
      lines.push(
        `  - ${wp.id} [${wp.lane}]: ${wp.title}${gateTag}${unblockNote}`
      );
    }
  }

  if (blocked.length) {
    lines.push('Blocked:');
    for (const wp of blocked) {
      const blockers = wp.blocked_by.join(', ') || 'unspecified';
      lines.push(`  - ${wp.id} [${wp.lane}]: ${wp.title} (blocked_by: ${blockers})`);
    }
  }

  lines.push(
    'Standing rules: update .ratchet/work-packages.yaml and .ratchet/human-dependencies.md in the same commit/PR when claiming, finishing, or blocking a slice (even during ad-hoc sessions outside swe-loop). Merge intermediate slices (WP-1..N-1) dark/opt-in using the Unblock-with default so main stays safe for existing users; only the final cutover slice flips the user-facing switch after human_gate checks pass.',
    '</ratchet-work-packages>',
    ''
  );
  return lines.join('\n');
}

export function runSessionStart(startDir) {
  const ratchetDir = findRatchetDir(startDir);
  if (!ratchetDir) {
    return '';
  }
  const wpPath = path.join(ratchetDir, WORK_PACKAGES_FILE);
  const hdPath = path.join(ratchetDir, HUMAN_DEPS_FILE);
  const yamlText = fs.readFileSync(wpPath, 'utf8');
  const hdText = fs.existsSync(hdPath) ? fs.readFileSync(hdPath, 'utf8') : '';
  const workPackages = parseWorkPackages(yamlText);
  const humanDeps = parseHumanDependencies(hdText);
  const referencedNumbers = extractReferencedNumbers(yamlText, hdText);
  const openIssues = fetchOpenGitHubIssues(path.dirname(ratchetDir));
  const untrackedIssues = openIssues.filter(
    (issue) =>
      typeof issue?.number === 'number' && !referencedNumbers.has(issue.number)
  );
  return buildBriefing(ratchetDir, workPackages, humanDeps, untrackedIssues);
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const targetDir =
    process.argv[2] || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    const output = runSessionStart(targetDir);
    if (output) {
      process.stdout.write(output);
    }
  } catch {
    // Never block session start on a malformed local file.
  }
}
