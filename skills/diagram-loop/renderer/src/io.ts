import {readFile, rename, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

import {parse} from "yaml";

import {resolveExistingWithin, resolveWritableWithin} from "./paths.js";

export async function readYamlFile(runRoot: string, relativePath: string): Promise<unknown> {
  return parse(await readFile(await resolveExistingWithin(runRoot, relativePath), "utf8"));
}

export async function readMarkdownFrontmatter(
  runRoot: string,
  relativePath: string,
): Promise<unknown> {
  const text = await readFile(await resolveExistingWithin(runRoot, relativePath), "utf8");
  const lines = text.split(/\r?\n/u);
  if (lines[0] !== "---") throw new Error(`${relativePath} must begin with YAML frontmatter`);
  const end = lines.indexOf("---", 1);
  if (end === -1) throw new Error(`${relativePath} frontmatter is not closed`);
  return parse(lines.slice(1, end).join("\n"));
}

export function rendererRootFromModule(moduleUrl: string): string {
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), "..");
}

export async function atomicWriteFile(
  runRoot: string,
  relativePath: string,
  data: string | Uint8Array,
): Promise<void> {
  const destination = await resolveWritableWithin(runRoot, relativePath);
  const directory = path.posix.dirname(relativePath);
  const temporaryName = `.${path.posix.basename(relativePath)}.${process.pid}.tmp`;
  const temporary = await resolveWritableWithin(
    runRoot,
    directory === "." ? temporaryName : `${directory}/${temporaryName}`,
  );
  await writeFile(temporary, data);
  await rename(temporary, destination);
}
