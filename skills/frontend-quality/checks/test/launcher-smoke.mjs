import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startFixture } from "./fixtures/catalog-fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const parent = process.env.RATCHET_FRONTEND_LAUNCHER_ARTIFACTS || tmpdir();
await mkdir(parent, { recursive: true });
const directory = await mkdtemp(path.join(parent, "ratchet-frontend-launcher-"));
const fixture = await startFixture();
let passed = false;

async function launch(output, environment = {}) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath,
      [path.join(root, "../scripts/run-checks.mjs"), path.join(directory, "config.mjs"), "--output", output],
      { env: { ...process.env, RATCHET_FRONTEND_CACHE_ROOT: path.join(directory, "runtime"), ...environment } });
    let log = "";
    child.stdout.on("data", (chunk) => { log += chunk; });
    child.stderr.on("data", (chunk) => { log += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, log }));
  });
  assert.equal(result.code, 0, result.log);
  const report = JSON.parse(await readFile(path.join(output, "report.json"), "utf8"));
  assert.equal(report.status, "PASS");
  assert.equal(report.runs.length, 2);
}

try {
  await writeFile(path.join(directory, "config.mjs"), `
    import { fixtureConfig } from ${JSON.stringify(pathToFileURL(path.join(root, "test/fixtures/catalog-fixture.mjs")).href)};
    export default fixtureConfig(${JSON.stringify(fixture.baseURL)}, "catalog");
  `);
  await launch(path.join(directory, "cold"));
  const bin = path.join(directory, "bin");
  await mkdir(bin);
  await writeFile(path.join(bin, "npm"), "#!/bin/sh\nexit 91\n");
  await chmod(path.join(bin, "npm"), 0o755);
  await launch(path.join(directory, "warm"), { PATH: `${bin}${path.delimiter}${process.env.PATH}` });
  passed = true;
  console.log("PASS: external runtime installs once and remains usable with npm unavailable");
} finally {
  await fixture.close();
  if (passed && !process.env.RATCHET_FRONTEND_LAUNCHER_ARTIFACTS) {
    await rm(directory, { recursive: true, force: true });
  } else console.log(`Launcher evidence: ${directory}`);
}
