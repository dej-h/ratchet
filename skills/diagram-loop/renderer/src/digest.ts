import {readdir, readFile} from "node:fs/promises";
import path from "node:path";

import {sha256, stableStringify} from "./canonical.js";

export interface NamedBytes {
  name: string;
  bytes: Uint8Array;
}

export interface InputDigestSources {
  scene: unknown;
  assets: unknown;
  renderPlan: unknown;
  materializedAssets: NamedBytes[];
  fonts: NamedBytes[];
  icons: NamedBytes[];
  rendererSources: NamedBytes[];
  dependencyLock: Uint8Array;
  designTokens: unknown;
}

export interface DigestEntry {
  name: string;
  sha256: string;
}

export interface InputManifest {
  version: 1;
  scene: unknown;
  assets: unknown;
  render_plan: unknown;
  materialized_assets: DigestEntry[];
  fonts: DigestEntry[];
  icons: DigestEntry[];
  renderer_sources: DigestEntry[];
  dependency_lock_sha256: string;
  design_tokens: unknown;
}

function digestEntries(entries: NamedBytes[]): DigestEntry[] {
  return entries
    .map((entry) => ({name: entry.name, sha256: sha256(entry.bytes)}))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function buildInputManifest(sources: InputDigestSources): InputManifest {
  return {
    version: 1,
    scene: sources.scene,
    assets: sources.assets,
    render_plan: sources.renderPlan,
    materialized_assets: digestEntries(sources.materializedAssets),
    fonts: digestEntries(sources.fonts),
    icons: digestEntries(sources.icons),
    renderer_sources: digestEntries(sources.rendererSources),
    dependency_lock_sha256: sha256(sources.dependencyLock),
    design_tokens: sources.designTokens,
  };
}

export function inputDigest(sources: InputDigestSources): string {
  return sha256(stableStringify(buildInputManifest(sources)));
}

export interface OutputChecksum {
  path: string;
  sha256: string;
}

export function renderDigest(input: string, outputs: OutputChecksum[]): string {
  const normalizedOutputs = [...outputs].sort((left, right) => left.path.localeCompare(right.path));
  return sha256(stableStringify({input_digest: input, outputs: normalizedOutputs}));
}

export function reviewIsCurrent(options: {
  currentInputDigest: string;
  reviewedInputDigest: string | null;
  currentRenderDigest: string | null;
  reviewedRenderDigest: string | null;
}): boolean {
  return options.reviewedInputDigest !== null
    && options.currentInputDigest === options.reviewedInputDigest
    && options.currentRenderDigest !== null
    && options.currentRenderDigest === options.reviewedRenderDigest;
}

async function collectFiles(root: string, current: string): Promise<NamedBytes[]> {
  const directory = path.join(root, current);
  const entries = await readdir(directory, {withFileTypes: true});
  const collected: NamedBytes[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = path.posix.join(current.split(path.sep).join(path.posix.sep), entry.name);
    if (entry.isDirectory()) {
      collected.push(...await collectFiles(root, relative));
    } else if (entry.isFile() && /\.(?:ts|tsx)$/u.test(entry.name)) {
      collected.push({name: relative, bytes: await readFile(path.join(root, relative))});
    }
  }
  return collected;
}

export async function collectRendererSources(rendererRoot: string): Promise<NamedBytes[]> {
  return collectFiles(rendererRoot, "src");
}
