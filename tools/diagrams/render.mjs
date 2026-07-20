import { spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolRoot, "../..");
const registryPath = path.join(repoRoot, "docs/diagrams/canonical-examples.json");
const defaultConfigs = {
  dark: "docs/diagrams/mermaid-dark.json",
  light: "docs/diagrams/mermaid-light.json",
};

function repositoryPath(relativePath) {
  const absolutePath = path.resolve(repoRoot, relativePath);
  const relativeToRoot = path.relative(repoRoot, absolutePath);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Path escapes repository root: ${relativePath}`);
  }
  return absolutePath;
}

export async function readRegistry() {
  const parsed = JSON.parse(await readFile(registryPath, "utf8"));
  if (parsed.schema_version !== 1 || !Array.isArray(parsed.examples)) {
    throw new Error("Unsupported canonical diagram registry");
  }
  return parsed.examples;
}

async function loadIconPacks(examples) {
  const packageNames = new Set(examples.flatMap((example) => example.icon_packs ?? []));
  const packs = new Map();
  for (const packageName of [...packageNames].sort()) {
    const prefix = packageName.split("/").at(-1);
    const iconPath = path.join(toolRoot, "node_modules", packageName, "icons.json");
    packs.set(prefix, await readFile(iconPath));
  }
  return packs;
}

export async function createIconPackServer(examples) {
  const packs = await loadIconPacks(examples);
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const prefix = decodeURIComponent(requestUrl.pathname.slice(1).replace(/\.json$/, ""));
    const body = packs.get(prefix);
    if (body === undefined) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" }).end(body);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Icon server did not expose a TCP address");
  }

  return {
    urls: [...packs.keys()].sort().map(
      (prefix) => `${prefix}#http://127.0.0.1:${address.port}/${prefix}.json`,
    ),
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)));
    }),
  };
}

async function writeFontCss(directory) {
  const fontPath = path.join(
    toolRoot,
    "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
  );
  const font = await readFile(fontPath);
  const cssPath = path.join(directory, "font.css");
  const encodedFont = font.toString("base64");
  await writeFile(
    cssPath,
    `@font-face {\n` +
      `  font-family: "Ratchet Inter";\n` +
      `  font-style: normal;\n` +
      `  font-weight: 400;\n` +
      `  src: url("data:font/woff2;base64,${encodedFont}") format("woff2");\n` +
      `}\n` +
      `:root, body, svg, .label, .nodeLabel, .edgeLabel {\n` +
      `  font-family: "Ratchet Inter" !important;\n` +
      `}\n`,
  );
  return cssPath;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, NO_PROXY: "127.0.0.1,localhost" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited ${code}\n${stdout}${stderr}`));
    });
  });
}

function configFor(example, theme) {
  return example.configs?.[theme] ?? defaultConfigs[theme];
}

export async function renderExample({ example, theme, output, fontCss, iconUrls }) {
  const mmdc = path.join(toolRoot, "node_modules/.bin/mmdc");
  await access(mmdc);
  const args = [
    "-i",
    repositoryPath(example.source),
    "-o",
    output,
    "-t",
    theme === "dark" ? "dark" : "default",
    "-b",
    theme === "dark" ? "#0d1117" : "white",
    "-c",
    repositoryPath(configFor(example, theme)),
    "-C",
    fontCss,
    "-I",
    `ratchet-${example.id}-${theme}`,
    "--quiet",
  ];
  if ((example.icon_packs ?? []).length > 0) {
    const prefixes = new Set(
      example.icon_packs.map((packageName) => packageName.split("/").at(-1)),
    );
    const selectedUrls = iconUrls.filter((url) => prefixes.has(url.split("#", 1)[0]));
    args.push("--iconPacksNamesAndUrls", ...selectedUrls);
  }
  await run(mmdc, args);
}

async function renderPass(examples, directory, fontCss, iconUrls) {
  const outputs = new Map();
  for (const example of examples) {
    for (const theme of ["dark", "light"]) {
      const output = path.join(directory, `${example.id}-${theme}.svg`);
      await renderExample({ example, theme, output, fontCss, iconUrls });
      outputs.set(`${example.id}:${theme}`, output);
    }
  }
  return outputs;
}

function requiredOutput(outputs, key) {
  const output = outputs.get(key);
  if (output === undefined) {
    throw new Error(`Renderer did not produce ${key}`);
  }
  return output;
}

async function compareFiles(firstPath, secondPath, context) {
  const [first, second] = await Promise.all([readFile(firstPath), readFile(secondPath)]);
  if (!first.equals(second)) {
    throw new Error(`${context}: rendered SVG bytes differ`);
  }
}

export async function renderCanonicalDiagrams(mode) {
  const examples = await readRegistry();
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "ratchet-diagrams-"));
  const firstPassDirectory = path.join(temporaryRoot, "first");
  const secondPassDirectory = path.join(temporaryRoot, "second");
  const iconServer = await createIconPackServer(examples);
  try {
    await Promise.all([mkdir(firstPassDirectory), mkdir(secondPassDirectory)]);
    const fontCss = await writeFontCss(temporaryRoot);
    const firstOutputs = await renderPass(
      examples,
      firstPassDirectory,
      fontCss,
      iconServer.urls,
    );
    const secondOutputs = await renderPass(
      examples,
      secondPassDirectory,
      fontCss,
      iconServer.urls,
    );

    for (const example of examples) {
      for (const theme of ["dark", "light"]) {
        const key = `${example.id}:${theme}`;
        const firstOutput = requiredOutput(firstOutputs, key);
        const secondOutput = requiredOutput(secondOutputs, key);
        await compareFiles(firstOutput, secondOutput, `${key} deterministic check`);
        if (example.rendering !== "icon") {
          continue;
        }
        const committed = repositoryPath(example.renders[theme]);
        if (mode === "write") {
          await copyFile(firstOutput, committed);
        } else {
          await compareFiles(firstOutput, committed, key);
        }
      }
    }
  } finally {
    await iconServer.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function main() {
  const [argument] = process.argv.slice(2);
  if (argument !== "--write" && argument !== "--check") {
    throw new Error("Usage: node render.mjs --write|--check");
  }
  const mode = argument.slice(2);
  await renderCanonicalDiagrams(mode);
  process.stdout.write(`PASS: canonical diagrams ${mode} completed\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
