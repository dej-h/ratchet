import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  compareFiles,
  createIconPackServer,
  readRegistry,
  renderCanonicalDiagrams,
} from "../render.mjs";

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

test("locked renderer reproduces every canonical diagram", { timeout: 60_000 }, async () => {
  await renderCanonicalDiagrams("check");
});
