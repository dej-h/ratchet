import path from "node:path";
import {lstat, mkdir, realpath} from "node:fs/promises";

const SAFE_KEY = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;

export function parseRunKey(value: string, label: string): string {
  if (!SAFE_KEY.test(value)) {
    throw new Error(
      `${label} must contain lowercase letters, digits, and internal hyphens only`,
    );
  }
  return value;
}

export function resolveWithin(root: string, relativePath: string): string {
  if (
    relativePath.length === 0 ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\")
  ) {
    throw new Error(`Path must be normalized and relative: ${relativePath}`);
  }
  const normalized = path.posix.normalize(relativePath);
  if (normalized !== relativePath || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Path escapes its root: ${relativePath}`);
  }
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, relativePath);
  const fromRoot = path.relative(absoluteRoot, absolutePath);
  if (fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) {
    throw new Error(`Path escapes its root: ${relativePath}`);
  }
  return absolutePath;
}

export function assertAbsoluteRunRoot(root: string): string {
  if (!path.isAbsolute(root)) {
    throw new Error(`Run root must be absolute: ${root}`);
  }
  return path.resolve(root);
}

function assertContained(root: string, candidate: string, label: string): void {
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes its root`);
  }
}

/** Resolve an existing file without following any symlink below the trusted root. */
export async function resolveExistingWithin(rootValue: string, relativePath: string): Promise<string> {
  const candidate = resolveWithin(rootValue, relativePath);
  const root = await realpath(path.resolve(rootValue));
  const relative = path.relative(path.resolve(rootValue), candidate);
  let cursor = path.resolve(rootValue);
  for (const component of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    const metadata = await lstat(cursor);
    if (metadata.isSymbolicLink()) {
      throw new Error(`Symlinks are not allowed inside a diagram run: ${relativePath}`);
    }
  }
  const resolved = await realpath(candidate);
  assertContained(root, resolved, `Path ${relativePath}`);
  return resolved;
}

/** Resolve a write target after proving its existing parent chain is symlink-free. */
export async function resolveWritableWithin(rootValue: string, relativePath: string): Promise<string> {
  const candidate = resolveWithin(rootValue, relativePath);
  const root = await realpath(path.resolve(rootValue));
  const parent = path.dirname(candidate);
  const resolvedParent = await realpath(parent);
  assertContained(root, resolvedParent, `Parent of ${relativePath}`);
  const parentRelative = path.relative(path.resolve(rootValue), parent);
  let cursor = path.resolve(rootValue);
  for (const component of parentRelative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    if ((await lstat(cursor)).isSymbolicLink()) {
      throw new Error(`Symlinks are not allowed inside a diagram run: ${relativePath}`);
    }
  }
  try {
    if ((await lstat(candidate)).isSymbolicLink()) {
      throw new Error(`Symlink write target is not allowed: ${relativePath}`);
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  return candidate;
}

export async function ensureDirectoryWithin(rootValue: string, relativePath: string): Promise<string> {
  const target = resolveWithin(rootValue, relativePath);
  const root = await realpath(path.resolve(rootValue));
  const relative = path.relative(path.resolve(rootValue), target);
  let cursor = path.resolve(rootValue);
  for (const component of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    try {
      const metadata = await lstat(cursor);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new Error(`Directory path is not a real directory: ${relativePath}`);
      }
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      await mkdir(cursor);
    }
  }
  const resolved = await realpath(target);
  assertContained(root, resolved, `Directory ${relativePath}`);
  return target;
}

export async function assertManagedRunRoot(rootValue: string): Promise<string> {
  const root = assertAbsoluteRunRoot(rootValue);
  const base = path.resolve(defaultExternalRoot());
  assertContained(base, root, `Run root ${root}`);
  if (root === base) throw new Error("Run root must identify a repository key and slug");
  const components = path.relative(base, root).split(path.sep);
  if (components.length !== 2) throw new Error("Run root must identify exactly one repository key and slug");
  parseRunKey(components[0] ?? "", "repository key");
  parseRunKey(components[1] ?? "", "slug");
  const [realBase, realRoot] = await Promise.all([realpath(base), realpath(root)]);
  assertContained(realBase, realRoot, `Run root ${root}`);
  return root;
}

function defaultExternalRoot(): string {
  const userHome = process.env.HOME;
  if (userHome === undefined || userHome.length === 0) {
    throw new Error("HOME is required to resolve the diagram-loop run root");
  }
  return path.join(userHome, ".claude", "diagram-loops");
}
