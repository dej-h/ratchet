import { createServer } from "node:http";
import {
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
import puppeteer from "puppeteer";

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
    probe: "Cache miss",
    source: "@fontsource/inter/files/inter-latin-400-normal.woff2",
  },
  {
    family: "Ratchet Symbols",
    probe: "①",
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

export function createPreviewExample(source, registeredExamples) {
  const absoluteSource = repositoryPath(source);
  const relativeSource = path.relative(repoRoot, absoluteSource);
  const id = path.parse(relativeSource).name.replaceAll(/[^A-Za-z0-9-]/gu, "-");
  if (id.length === 0) {
    throw new Error(`Preview source needs a usable filename: ${source}`);
  }
  return {
    id,
    icon_packs: [...new Set(registeredExamples.flatMap(
      (example) => example.icon_packs ?? [],
    ))].sort(),
    rendering: "icon",
    source: relativeSource,
  };
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

export async function loadFontCss() {
  const fontFaces = [];
  for (const fontSource of fontSources) {
    const font = await readFile(path.join(toolRoot, "node_modules", fontSource.source));
    fontFaces.push(
      `@font-face {\n` +
        `  font-family: "${fontSource.family}";\n` +
        `  font-style: normal;\n` +
        `  font-weight: 400;\n` +
        `  src: url("data:font/woff2;base64,${font.toString("base64")}") format("woff2");\n` +
        `}`,
    );
  }

  return (
    `${fontFaces.join("\n")}\n` +
    `:root, body, svg, .label, .nodeLabel, .edgeLabel {\n` +
    `  font-family: "Ratchet Inter", "Ratchet Symbols" !important;\n` +
    `}\n`
  );
}

function configFor(example, theme) {
  return example.configs?.[theme] ?? defaultConfigs[theme];
}

export async function puppeteerConfiguration(isCi = process.env.CI === "true") {
  const configuration = { headless: "shell" };
  if (!isCi) {
    return configuration;
  }
  const policy = JSON.parse(
    await readFile(path.join(toolRoot, "puppeteer-ci.json"), "utf8"),
  );
  return { ...configuration, ...policy };
}

export async function renderExample({ browser, example, theme, output, fontCss, iconUrls }) {
  const definition = await readFile(repositoryPath(example.source), "utf8");
  const mermaidConfig = JSON.parse(
    await readFile(repositoryPath(configFor(example, theme)), "utf8"),
  );
  const backgroundColor = theme === "dark" ? "#0d1117" : "white";
  if ((example.icon_packs ?? []).length > 0) {
    const prefixes = new Set(
      example.icon_packs.map((packageName) => packageName.split("/").at(-1)),
    );
    iconUrls = iconUrls.filter((url) => prefixes.has(url.split("#", 1)[0]));
  }

  const page = await browser.newPage();
  let renderError;
  try {
    await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 });
    await page.setContent('<!doctype html><html><body><div id="container"></div></body></html>');
    await page.addStyleTag({ content: fontCss });
    await page.evaluate(async (fontProbes) => {
      for (const { family, probe } of fontProbes) {
        const loaded = await document.fonts.load(`400 16px "${family}"`, probe);
        if (loaded.length !== 1) {
          throw new Error(`Expected one loaded face for ${family}, got ${loaded.length}`);
        }
      }
      await document.fonts.ready;
    }, fontSources.map(({ family, probe }) => ({ family, probe })));
    await page.addScriptTag({
      path: path.join(toolRoot, "node_modules/mermaid/dist/mermaid.min.js"),
    });

    await page.$eval(
      "#container",
      async (
        container,
        {
          backgroundColor: pageBackground,
          definition: source,
          fontCss,
          iconPackUrls,
          mermaidConfig: configuration,
          svgId,
          theme: selectedTheme,
        },
      ) => {
        const mermaid = window.mermaid;
        mermaid.registerIconPacks(
          iconPackUrls.map((iconPackUrl) => {
            const [name, url] = iconPackUrl.split("#", 2);
            return { name, loader: () => fetch(url).then((response) => response.json()) };
          }),
        );
        mermaid.initialize({
          startOnLoad: false,
          theme: selectedTheme === "dark" ? "dark" : "default",
          ...configuration,
        });
        const { svg: svgText } = await mermaid.render(svgId, source, container);
        container.innerHTML = svgText;
        const svg = container.querySelector("svg");
        svg.style.backgroundColor = pageBackground;
        const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
        style.appendChild(document.createTextNode(fontCss));
        svg.appendChild(style);
      },
      {
        backgroundColor,
        definition,
        fontCss,
        iconPackUrls: iconUrls,
        mermaidConfig,
        svgId: `ratchet-${example.id}-${theme}`,
        theme,
      },
    );
    const svg = await page.$eval("svg", (element) =>
      new XMLSerializer().serializeToString(element),
    );
    await writeFile(output, svg);
    await normalizeIconifyIds(output);
  } catch (error) {
    renderError = error;
  } finally {
    try {
      await page.close();
    } catch (closeError) {
      if (renderError !== undefined) {
        throw new AggregateError(
          [renderError, closeError],
          `Rendering ${example.id}:${theme} and closing its page failed`,
        );
      }
      throw closeError;
    }
  }
  if (renderError !== undefined) {
    throw renderError;
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

async function renderPass(browser, examples, directory, fontCss, iconUrls) {
  const outputs = new Map();
  for (const example of examples) {
    for (const theme of ["dark", "light"]) {
      const output = path.join(directory, `${example.id}-${theme}.svg`);
      await renderExample({ browser, example, theme, output, fontCss, iconUrls });
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

export async function renderCanonicalDiagrams(mode, outputDirectory, previewSource) {
  const registeredExamples = await readRegistry();
  const examples = mode === "preview"
    ? [createPreviewExample(previewSource, registeredExamples)]
    : registeredExamples;
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "ratchet-diagrams-"));
  const firstPassDirectory = path.join(temporaryRoot, "first");
  const secondPassDirectory = path.join(temporaryRoot, "second");
  let browser;
  let iconServer;
  let renderError;
  try {
    iconServer = await createIconPackServer(examples);
    browser = await puppeteer.launch(await puppeteerConfiguration());
    await Promise.all([mkdir(firstPassDirectory), mkdir(secondPassDirectory)]);
    const fontCss = await loadFontCss();
    const firstOutputs = await renderPass(
      browser,
      examples,
      firstPassDirectory,
      fontCss,
      iconServer.urls,
    );
    const secondOutputs = await renderPass(
      browser,
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
        if (mode === "diagnose" || mode === "preview") {
          await mkdir(outputDirectory, { recursive: true });
          await copyFile(
            firstOutput,
            path.join(outputDirectory, `${example.id}-${theme}.svg`),
          );
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
  } catch (error) {
    renderError = error;
  } finally {
    const cleanupErrors = [];
    for (const resource of [browser, iconServer]) {
      if (resource === undefined) {
        continue;
      }
      try {
        await resource.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await rm(temporaryRoot, { recursive: true, force: true });
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length > 0) {
      const errors = renderError === undefined
        ? cleanupErrors
        : [renderError, ...cleanupErrors];
      const message = renderError === undefined
        ? "Canonical renderer cleanup failed"
        : "Canonical rendering and cleanup failed";
      throw new AggregateError(errors, message);
    }
  }
  if (renderError !== undefined) {
    throw renderError;
  }
}

async function main() {
  const [argument, firstValue, secondValue] = process.argv.slice(2);
  const mode = argument?.slice(2);
  const outputDirectory = mode === "preview" ? secondValue : firstValue;
  const previewSource = mode === "preview" ? firstValue : undefined;
  if (
    !["write", "check", "diagnose", "preview"].includes(mode) ||
    ((mode === "diagnose" || mode === "preview") && outputDirectory === undefined) ||
    (mode === "preview" && previewSource === undefined)
  ) {
    throw new Error(
      "Usage: node render.mjs --write|--check|--diagnose <directory>|" +
        "--preview <source.mmd> <directory>",
    );
  }
  await renderCanonicalDiagrams(mode, outputDirectory, previewSource);
  process.stdout.write(`PASS: canonical diagrams ${mode} completed\n`);
}

export function formatError(error) {
  const ownError = error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
  if (!(error instanceof AggregateError)) {
    return ownError;
  }
  const members = error.errors.map(
    (member, index) => `Aggregate member ${index + 1}:\n${formatError(member)}`,
  );
  return [ownError, ...members].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${formatError(error)}\n`);
    process.exitCode = 1;
  });
}
