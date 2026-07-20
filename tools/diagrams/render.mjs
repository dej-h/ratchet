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
const fontSources = [
  {
    family: "Ratchet Inter",
    filename: "inter-latin-400-normal.woff2",
    source: "@fontsource/inter/files/inter-latin-400-normal.woff2",
  },
  {
    family: "Ratchet Symbols",
    filename: "noto-sans-symbols-symbols-400-normal.woff2",
    source: "@fontsource/noto-sans-symbols/files/noto-sans-symbols-symbols-400-normal.woff2",
  },
];

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
    response.writeHead(200, {
      "access-control-allow-origin": "*",
      "content-type": "application/json",
    }).end(body);
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

function escapeXmlText(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export async function writeFontAssets(directory) {
  const fontDirectory = path.join(directory, "fonts");
  const fontCacheDirectory = path.join(directory, "font-cache");
  await Promise.all([
    mkdir(fontDirectory, { recursive: true }),
    mkdir(fontCacheDirectory, { recursive: true }),
  ]);

  const fontFaces = [];
  const fontScanRules = [];
  for (const fontSource of fontSources) {
    const installedPath = path.join(fontDirectory, fontSource.filename);
    const font = await readFile(path.join(toolRoot, "node_modules", fontSource.source));
    await writeFile(installedPath, font);
    fontFaces.push(
      `@font-face {\n` +
        `  font-family: "${fontSource.family}";\n` +
        `  font-style: normal;\n` +
        `  font-weight: 400;\n` +
        `  src: url("data:font/woff2;base64,${font.toString("base64")}") format("woff2");\n` +
        `}`,
    );
    fontScanRules.push(
      `  <match target="scan">\n` +
        `    <test name="file" compare="eq">\n` +
        `      <string>${escapeXmlText(installedPath)}</string>\n` +
        `    </test>\n` +
        `    <edit name="family" mode="assign">\n` +
        `      <string>${fontSource.family}</string>\n` +
        `    </edit>\n` +
        `  </match>`,
    );
  }

  const cssPath = path.join(directory, "font.css");
  await writeFile(
    cssPath,
    `${fontFaces.join("\n")}\n` +
      `:root, body, svg, .label, .nodeLabel, .edgeLabel {\n` +
      `  font-family: "Ratchet Inter", "Ratchet Symbols" !important;\n` +
      `}\n`,
  );

  const fontConfigPath = path.join(directory, "fonts.conf");
  await writeFile(
    fontConfigPath,
    `<?xml version="1.0"?>\n` +
      `<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">\n` +
      `<fontconfig>\n` +
      `  <include ignore_missing="no">/etc/fonts/fonts.conf</include>\n` +
      `  <dir>${escapeXmlText(fontDirectory)}</dir>\n` +
      `  <cachedir>${escapeXmlText(fontCacheDirectory)}</cachedir>\n` +
      `${fontScanRules.join("\n")}\n` +
      `</fontconfig>\n`,
  );
  return { cssPath, fontConfigPath };
}

function run(command, args, environment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...environment,
        NO_PROXY: "127.0.0.1,localhost",
      },
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

export function ciPuppeteerArguments(isCi = process.env.CI === "true") {
  if (!isCi) {
    return [];
  }
  return ["-p", path.join(toolRoot, "puppeteer-ci.json")];
}

export async function renderExample({ example, theme, output, fonts, iconUrls }) {
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
    fonts.cssPath,
    "-I",
    `ratchet-${example.id}-${theme}`,
    ...ciPuppeteerArguments(),
    "--quiet",
  ];
  if ((example.icon_packs ?? []).length > 0) {
    const prefixes = new Set(
      example.icon_packs.map((packageName) => packageName.split("/").at(-1)),
    );
    const selectedUrls = iconUrls.filter((url) => prefixes.has(url.split("#", 1)[0]));
    args.push("--iconPacksNamesAndUrls", ...selectedUrls);
  }
  await run(mmdc, args, { FONTCONFIG_FILE: fonts.fontConfigPath });
  if (path.extname(output) === ".svg") {
    await normalizeIconifyIds(output);
  }
}

export async function normalizeIconifyIds(svgPath) {
  const svg = await readFile(svgPath, "utf8");
  const replacements = new Map();
  const normalized = svg.replace(/\bIconifyId[A-Za-z0-9]+\b/gu, (identifier) => {
    if (!replacements.has(identifier)) {
      replacements.set(identifier, `ratchet-icon-definition-${replacements.size + 1}`);
    }
    return replacements.get(identifier);
  });
  if (normalized !== svg) {
    await writeFile(svgPath, normalized);
  }
}

async function renderPass(examples, directory, fonts, iconUrls) {
  const outputs = new Map();
  for (const example of examples) {
    for (const theme of ["dark", "light"]) {
      const output = path.join(directory, `${example.id}-${theme}.svg`);
      await renderExample({ example, theme, output, fonts, iconUrls });
      if (example.rendering === "icon") {
        await assertNoIconPlaceholders(output, `${example.id}:${theme}`);
      }
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

export async function compareFiles(firstPath, secondPath, context) {
  const [first, second] = await Promise.all([readFile(firstPath), readFile(secondPath)]);
  if (!first.equals(second)) {
    throw new Error(`${context}: rendered SVG bytes differ`);
  }
}

export async function assertNoIconPlaceholders(svgPath, context) {
  const svg = await readFile(svgPath, "utf8");
  if (/<tspan\b[^>]*>\s*\?\s*<\/tspan>/u.test(svg)) {
    throw new Error(`${context}: rendered SVG contains an unresolved icon placeholder`);
  }
}

export async function renderCanonicalDiagrams(mode, diagnosticDirectory) {
  const examples = await readRegistry();
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "ratchet-diagrams-"));
  const firstPassDirectory = path.join(temporaryRoot, "first");
  const secondPassDirectory = path.join(temporaryRoot, "second");
  let iconServer;
  try {
    iconServer = await createIconPackServer(examples);
    await Promise.all([mkdir(firstPassDirectory), mkdir(secondPassDirectory)]);
    const fonts = await writeFontAssets(temporaryRoot);
    const firstOutputs = await renderPass(
      examples,
      firstPassDirectory,
      fonts,
      iconServer.urls,
    );
    const secondOutputs = await renderPass(
      examples,
      secondPassDirectory,
      fonts,
      iconServer.urls,
    );

    for (const example of examples) {
      for (const theme of ["dark", "light"]) {
        const key = `${example.id}:${theme}`;
        const firstOutput = requiredOutput(firstOutputs, key);
        const secondOutput = requiredOutput(secondOutputs, key);
        await compareFiles(firstOutput, secondOutput, `${key} deterministic check`);
        if (mode === "diagnose") {
          await mkdir(diagnosticDirectory, { recursive: true });
          await copyFile(firstOutput, path.join(diagnosticDirectory, `${key}.svg`));
          continue;
        }
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
    try {
      if (iconServer !== undefined) {
        await iconServer.close();
      }
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
}

async function main() {
  const [argument, diagnosticDirectory] = process.argv.slice(2);
  const mode = argument?.slice(2);
  if (
    (mode !== "write" && mode !== "check" && mode !== "diagnose") ||
    (mode === "diagnose" && diagnosticDirectory === undefined)
  ) {
    throw new Error("Usage: node render.mjs --write|--check|--diagnose <directory>");
  }
  await renderCanonicalDiagrams(mode, diagnosticDirectory);
  process.stdout.write(`PASS: canonical diagrams ${mode} completed\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
