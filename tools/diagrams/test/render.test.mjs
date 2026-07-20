import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertNoIconPlaceholders,
  ciPuppeteerArguments,
  compareFiles,
  createIconPackServer,
  normalizeIconifyIds,
  readRegistry,
  writeFontAssets,
} from "../render.mjs";

const diagramsRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("browser sandbox override is restricted to one CI policy", async () => {
  assert.deepEqual(ciPuppeteerArguments(false), []);
  const ciArguments = ciPuppeteerArguments(true);
  assert.equal(ciArguments[0], "-p");
  const configPath = ciArguments[1];
  assert.equal(path.isAbsolute(configPath), true);
  assert.equal(path.basename(configPath), "puppeteer-ci.json");
  const policy = JSON.parse(await readFile(configPath, "utf8"));
  assert.deepEqual(policy, { args: ["--no-sandbox"] });
});

test("font assets pin layout aliases and embed the same files", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ratchet-font-test-"));
  try {
    const fonts = await writeFontAssets(directory);
    const expectedFonts = [
      {
        family: "Ratchet Inter",
        filename: "inter-latin-400-normal.woff2",
        packagePath: path.join(
          diagramsRoot,
          "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
        ),
      },
      {
        family: "Ratchet Symbols",
        filename: "noto-sans-symbols-symbols-400-normal.woff2",
        packagePath: path.join(
          diagramsRoot,
          "node_modules/@fontsource/noto-sans-symbols/files/" +
            "noto-sans-symbols-symbols-400-normal.woff2",
        ),
      },
    ];
    const [css, config] = await Promise.all([
      readFile(fonts.cssPath, "utf8"),
      readFile(fonts.fontConfigPath, "utf8"),
    ]);
    const fontDirectory = path.join(directory, "fonts");
    const fontCacheDirectory = path.join(directory, "font-cache");
    assert.ok(config.includes(`<dir>${fontDirectory}</dir>`));
    assert.ok(config.includes(`<cachedir>${fontCacheDirectory}</cachedir>`));
    assert.ok(
      config.includes('<include ignore_missing="no">/etc/fonts/fonts.conf</include>'),
    );

    const faceBlocks = css.split("@font-face {").slice(1);
    assert.equal(faceBlocks.length, expectedFonts.length);
    for (const expectedFont of expectedFonts) {
      const installedPath = path.join(fontDirectory, expectedFont.filename);
      const [packageBytes, installedBytes] = await Promise.all([
        readFile(expectedFont.packagePath),
        readFile(installedPath),
      ]);
      assert.deepEqual(installedBytes, packageBytes);

      const face = faceBlocks.find((block) =>
        block.includes(`font-family: "${expectedFont.family}";`),
      );
      assert.notEqual(face, undefined);
      const encoded = face.match(/data:font\/woff2;base64,([^"\)]+)/u)?.[1];
      assert.notEqual(encoded, undefined);
      assert.deepEqual(Buffer.from(encoded, "base64"), packageBytes);

      const scanRule =
        `<string>${installedPath}</string>\n` +
        `    </test>\n` +
        `    <edit name="family" mode="assign">\n` +
        `      <string>${expectedFont.family}</string>`;
      assert.ok(config.includes(scanRule));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("registry exposes the five canonical examples", async () => {
  const examples = await readRegistry();
  assert.deepEqual(
    examples.map((example) => example.id),
    [
      "platform-threat-model",
      "swe-loop",
      "voortman-fullstack-review",
      "cache-lookup-icons",
      "voortman-fullstack-deploy-icons",
    ],
  );
});

test("icon packs are served from locked loopback data only", async () => {
  const examples = await readRegistry();
  const server = await createIconPackServer(examples);
  try {
    assert.equal(server.urls.length, 2);
    for (const namedUrl of server.urls) {
      assert.equal(namedUrl.includes("unpkg"), false);
      const [prefix, url] = namedUrl.split("#", 2);
      const parsedUrl = new URL(url);
      assert.equal(parsedUrl.hostname, "127.0.0.1");
      const response = await fetch(url);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("access-control-allow-origin"), "*");
      const iconPack = await response.json();
      assert.equal(iconPack.prefix, prefix);
      assert.ok(Object.keys(iconPack.icons).length > 0);
    }

    const sampleUrl = new URL(server.urls[0].split("#", 2)[1]);
    sampleUrl.pathname = "/missing.json";
    assert.equal((await fetch(sampleUrl)).status, 404);
  } finally {
    await server.close();
  }
});

test("icon fallback glyphs are rejected", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ratchet-icon-test-"));
  const valid = path.join(directory, "valid.svg");
  const unresolved = path.join(directory, "unresolved.svg");
  try {
    await Promise.all([
      writeFile(valid, '<svg><path d="M0 0h1v1z"/></svg>'),
      writeFile(unresolved, '<svg><tspan x="0" y="0">?</tspan></svg>'),
    ]);
    await assertNoIconPlaceholders(valid, "valid");
    await assert.rejects(
      assertNoIconPlaceholders(unresolved, "unresolved"),
      /contains an unresolved icon placeholder/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Iconify-generated IDs are normalized with their references", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ratchet-icon-id-test-"));
  const svgPath = path.join(directory, "icon.svg");
  try {
    await writeFile(
      svgPath,
      '<svg><linearGradient id="IconifyIdRandom1"/>' +
        '<path fill="url(#IconifyIdRandom1)"/>' +
        '<linearGradient id="IconifyIdRandom2"/>' +
        '<path fill="url(#IconifyIdRandom2)"/></svg>',
    );
    await normalizeIconifyIds(svgPath);
    const normalized = await readFile(svgPath, "utf8");
    assert.equal(normalized.includes("IconifyId"), false);
    assert.match(normalized, /id="ratchet-icon-definition-1"/);
    assert.match(normalized, /url\(#ratchet-icon-definition-1\)/);
    assert.match(normalized, /id="ratchet-icon-definition-2"/);
    assert.match(normalized, /url\(#ratchet-icon-definition-2\)/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("byte comparison accepts current output and rejects stale output", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ratchet-byte-test-"));
  const first = path.join(directory, "first.svg");
  const current = path.join(directory, "current.svg");
  const stale = path.join(directory, "stale.svg");
  try {
    await Promise.all([
      writeFile(first, "<svg>current</svg>"),
      writeFile(current, "<svg>current</svg>"),
      writeFile(stale, "<svg>stale</svg>"),
    ]);
    await compareFiles(first, current, "current");
    await assert.rejects(compareFiles(first, stale, "stale"), /rendered SVG bytes differ/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
