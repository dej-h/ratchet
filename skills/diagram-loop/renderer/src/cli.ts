import path from "node:path";

import {calculateIconHash} from "./assets.js";
import {compileRun} from "./compile.js";
import {designDigest} from "./design-digest.js";
import {rendererRootFromModule} from "./io.js";
import {assertManagedRunRoot} from "./paths.js";
import {readRenderManifest} from "./render-manifest.js";
import {renderRun} from "./render.js";
import {recordRunReview} from "./review.js";
import {
  advancePhase,
  approveGate,
  closeRun,
  initializeRun,
  loadState,
  reopenDesign,
  saveState,
} from "./state.js";
import {verifyRun, verifyRunOrInvalidateReview} from "./verify.js";

const HELP = `Ratchet diagram-loop renderer

Commands:
  init --repo-key <key> --slug <slug>
  status --run <absolute-path>
  design-digest --run <absolute-path>
  reopen-design --run <absolute-path>
  record-gate --run <absolute-path> --gate <a|b> --wording <exact-user-message> --digest <sha256>
  advance --run <absolute-path> --phase <0-7> --next-boundary <description>
  compile --run <absolute-path>
  render --run <absolute-path> [--browser-executable <absolute-path>]
  check --run <absolute-path>
  record-review --run <absolute-path> --output <path> [--output <path> ...]
  verify --run <absolute-path>
  close --run <absolute-path>
  icon-hash --ref <pack:name>
`;

interface ParsedArguments {
  command: string;
  values: Map<string, string[]>;
}

function parseArguments(argv: string[]): ParsedArguments {
  const [command, ...tokens] = argv;
  if (command === undefined || command === "--help" || command === "-h") {
    return {command: "help", values: new Map()};
  }
  const values = new Map<string, string[]>();
  for (let index = 0; index < tokens.length; index += 2) {
    const name = tokens[index];
    const value = tokens[index + 1];
    if (name === undefined || !name.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`Expected --name value pairs after ${command}`);
    }
    const key = name.slice(2);
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  return {command, values};
}

function assertAllowed(values: Map<string, string[]>, allowed: string[]): void {
  const allowlist = new Set(allowed);
  for (const key of values.keys()) {
    if (!allowlist.has(key)) throw new Error(`Unknown option: --${key}`);
  }
}

function one(values: Map<string, string[]>, key: string): string {
  const matches = values.get(key) ?? [];
  if (matches.length !== 1) throw new Error(`Expected exactly one --${key} value`);
  return matches[0] as string;
}

function optional(values: Map<string, string[]>, key: string): string | undefined {
  const matches = values.get(key) ?? [];
  if (matches.length > 1) throw new Error(`Expected at most one --${key} value`);
  return matches[0];
}

async function runPath(values: Map<string, string[]>): Promise<string> {
  return assertManagedRunRoot(one(values, "run"));
}

async function verifyOrInvalidate(options: {
  runRoot: string;
  rendererRoot: string;
  requireReview: boolean;
}): Promise<Awaited<ReturnType<typeof verifyRun>>> {
  return verifyRunOrInvalidateReview(options);
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const rendererRoot = rendererRootFromModule(import.meta.url);
  switch (args.command) {
    case "help":
      process.stdout.write(HELP);
      return;
    case "init": {
      assertAllowed(args.values, ["repo-key", "slug"]);
      const initialized = await initializeRun({
        repoKey: one(args.values, "repo-key"),
        slug: one(args.values, "slug"),
        templateRoot: path.resolve(rendererRoot, "..", "templates"),
      });
      printJson(initialized);
      return;
    }
    case "status": {
      assertAllowed(args.values, ["run"]);
      printJson(await loadState(await runPath(args.values)));
      return;
    }
    case "design-digest": {
      assertAllowed(args.values, ["run"]);
      printJson({design_digest: await designDigest(await runPath(args.values))});
      return;
    }
    case "reopen-design": {
      assertAllowed(args.values, ["run"]);
      const runRoot = await runPath(args.values);
      const updated = reopenDesign(await loadState(runRoot));
      await saveState(runRoot, updated);
      printJson(updated);
      return;
    }
    case "record-gate": {
      assertAllowed(args.values, ["run", "gate", "wording", "digest"]);
      const runRoot = await runPath(args.values);
      const gateValue = one(args.values, "gate");
      if (gateValue !== "a" && gateValue !== "b") throw new Error("--gate must be a or b");
      const digest = one(args.values, "digest");
      if (gateValue === "a") {
        const current = await designDigest(runRoot);
        if (current !== digest) throw new Error("Gate A digest is not the current design digest");
      } else {
        await verifyOrInvalidate({runRoot, rendererRoot, requireReview: true});
        const manifest = await readRenderManifest(runRoot);
        if (manifest.render_digest !== digest) throw new Error("Gate B digest is not the current render digest");
      }
      const updated = approveGate({
        state: await loadState(runRoot),
        gate: gateValue,
        wording: one(args.values, "wording"),
        digest,
      });
      await saveState(runRoot, updated);
      printJson(updated);
      return;
    }
    case "advance": {
      assertAllowed(args.values, ["run", "phase", "next-boundary"]);
      const runRoot = await runPath(args.values);
      const phase = Number(one(args.values, "phase"));
      const updated = advancePhase(
        await loadState(runRoot),
        phase,
        one(args.values, "next-boundary"),
      );
      await saveState(runRoot, updated);
      printJson(updated);
      return;
    }
    case "compile": {
      assertAllowed(args.values, ["run"]);
      const result = await compileRun(await runPath(args.values), rendererRoot);
      printJson({input_digest: result.scene.input_digest, scene: "compiled-scene.json"});
      return;
    }
    case "render": {
      assertAllowed(args.values, ["run", "browser-executable"]);
      const browserExecutable = optional(args.values, "browser-executable");
      const manifest = await renderRun({
        runRoot: await runPath(args.values),
        rendererRoot,
        ...(browserExecutable === undefined ? {} : {browserExecutable}),
      });
      printJson(manifest);
      return;
    }
    case "check": {
      assertAllowed(args.values, ["run"]);
      printJson(await verifyRun({
        runRoot: await runPath(args.values),
        rendererRoot,
        requireReview: false,
      }));
      return;
    }
    case "record-review": {
      assertAllowed(args.values, ["run", "output"]);
      const outputs = args.values.get("output") ?? [];
      if (outputs.length === 0) throw new Error("At least one --output is required");
      const runRoot = await runPath(args.values);
      await recordRunReview(runRoot, outputs, rendererRoot);
      printJson(await loadState(runRoot));
      return;
    }
    case "verify": {
      assertAllowed(args.values, ["run"]);
      printJson(await verifyOrInvalidate({
        runRoot: await runPath(args.values),
        rendererRoot,
        requireReview: true,
      }));
      return;
    }
    case "close": {
      assertAllowed(args.values, ["run"]);
      const runRoot = await runPath(args.values);
      await verifyOrInvalidate({runRoot, rendererRoot, requireReview: true});
      const updated = closeRun(await loadState(runRoot));
      await saveState(runRoot, updated);
      printJson(updated);
      return;
    }
    case "icon-hash": {
      assertAllowed(args.values, ["ref"]);
      printJson({sha256: await calculateIconHash(rendererRoot, one(args.values, "ref"))});
      return;
    }
    default:
      throw new Error(`Unknown command: ${args.command}\n\n${HELP}`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
