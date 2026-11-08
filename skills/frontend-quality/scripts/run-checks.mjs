#!/usr/bin/env node

import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../checks");
const files = ["package.json", "package-lock.json", "audit.mjs", "contract.mjs", "query-policy.mjs"];
const digest = createHash("sha256");
for (const file of files) digest.update(file).update("\0").update(await readFile(path.join(source, file)));
const root = path.resolve(process.env.RATCHET_FRONTEND_CACHE_ROOT
  || path.join(process.env.XDG_CACHE_HOME || path.join(homedir(), ".cache"), "ratchet", "frontend-quality"));
const runtime = path.join(root, digest.digest("hex"));

async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 2));
  });
}

try {
  try { await readFile(path.join(runtime, ".ready")); }
  catch {
    await mkdir(root, { recursive: true });
    const temporary = await mkdtemp(path.join(root, ".install-"));
    try {
      for (const file of files) await cp(path.join(source, file), path.join(temporary, file));
      if (await run("npm", ["ci", "--omit=dev", "--ignore-scripts"], { cwd: temporary }) !== 0) {
        throw new Error("Could not install the locked frontend checker");
      }
      await writeFile(path.join(temporary, ".ready"), "ready\n");
      try { await rename(temporary, runtime); }
      catch (error) { if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error; }
    } finally { await rm(temporary, { recursive: true, force: true }); }
  }
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--install-browser") {
    process.exitCode = await run(process.execPath,
      [path.join(runtime, "node_modules/playwright/cli.js"), "install", "chromium"]);
  } else {
    process.exitCode = await run(process.execPath, [path.join(runtime, "audit.mjs"), ...args]);
  }
} catch (error) {
  console.error(`BLOCKED: ${error.message}`);
  process.exitCode = 2;
}
