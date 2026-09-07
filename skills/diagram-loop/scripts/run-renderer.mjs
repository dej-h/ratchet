#!/usr/bin/env node

import {createHash} from "node:crypto";
import {cp, mkdir, readdir, readFile, rename, rm, writeFile} from "node:fs/promises";
import {homedir, tmpdir} from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(scriptRoot, "..", "renderer");
const templateRoot = path.resolve(scriptRoot, "..", "templates");

async function sourceFiles(root, relative = "") {
  const entries = await readdir(path.join(root, relative), {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "test") continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(root, child));
    else files.push(child);
  }
  return files.sort();
}

async function runtimeDigest() {
  const digest = createHash("sha256");
  digest.update("scripts/run-renderer.mjs").update("\0").update(await readFile(fileURLToPath(import.meta.url)));
  for (const relative of await sourceFiles(sourceRoot)) {
    digest.update(`renderer/${relative}`).update("\0").update(await readFile(path.join(sourceRoot, relative)));
  }
  for (const relative of await sourceFiles(templateRoot)) {
    digest.update(`templates/${relative}`).update("\0").update(await readFile(path.join(templateRoot, relative)));
  }
  return digest.digest("hex");
}

function cacheRoot() {
  if (process.env.RATCHET_DIAGRAM_CACHE_ROOT) return path.resolve(process.env.RATCHET_DIAGRAM_CACHE_ROOT);
  if (process.env.CLAUDE_PLUGIN_DATA) return path.join(process.env.CLAUDE_PLUGIN_DATA, "diagram-loop-runtimes");
  return path.join(process.env.XDG_CACHE_HOME || path.join(homedir(), ".cache"), "ratchet", "diagram-loop");
}

async function run(command, args, options) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio: "inherit", ...options});
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed${signal ? ` with ${signal}` : ` with exit code ${code}`}`));
    });
  });
}

async function materializeRuntime() {
  const digest = await runtimeDigest();
  const root = cacheRoot();
  const destination = path.join(root, digest);
  const ready = path.join(destination, ".ready");
  try {
    await readFile(ready);
    return path.join(destination, "renderer");
  } catch {}

  await mkdir(root, {recursive: true});
  const temporary = path.join(root, `.install-${process.pid}-${Date.now()}`);
  await mkdir(temporary);
  try {
    for (const [source, prefix] of [[sourceRoot, "renderer"], [templateRoot, "templates"]]) {
      for (const relative of await sourceFiles(source)) {
        const target = path.join(temporary, prefix, relative);
        await mkdir(path.dirname(target), {recursive: true});
        await cp(path.join(source, relative), target);
      }
    }
    await run("npm", ["ci", "--ignore-scripts"], {cwd: path.join(temporary, "renderer")});
    await writeFile(path.join(temporary, ".ready"), `${digest}\n`);
    try {
      await rename(temporary, destination);
    } catch (error) {
      if (!(
        error
        && typeof error === "object"
        && "code" in error
        && (error.code === "EEXIST" || error.code === "ENOTEMPTY")
      )) throw error;
    }
  } finally {
    await rm(temporary, {recursive: true, force: true});
  }
  return path.join(destination, "renderer");
}

const runtime = await materializeRuntime();
await run(process.execPath, ["--import", "tsx", "src/cli.ts", ...process.argv.slice(2)], {cwd: runtime});
