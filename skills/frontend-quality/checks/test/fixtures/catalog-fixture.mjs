import assert from "node:assert/strict";
import { createServer } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Each defect changes real browser behavior while retaining the same route contract.
function screen(variant, state) {
  state.recovery = variant === "recovery";
  const sequential = variant === "waterfall";
  const repeated = variant === "duplicate";
  const limit = variant === "parameters" ? 31 : 30;
  const missing = variant === "repeat" && ++state.repeatVisits > 1;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width"><title>Catalog</title>
    <link rel="icon" href="data:,"><style>
    body { font: 16px Arial; color: #111; background: #fff; margin: 16px; }
    button { color: #111; background: #eee; padding: 8px; border: 1px solid #333; }
    ${variant === "overflow" ? "main { width: 2000px; }" : ""}
    </style></head><body><main><h1>Catalog</h1>
    <button type="button" id="sort">Sort by name</button>
    ${variant === "accessible-name" ? '<button type="button"></button>' : ""}
    <section aria-label="Catalog items"><p role="status" id="state">Loading catalog</p><ul id="items"></ul></section>
    <section aria-label="Activity"><p id="activity">Loading activity</p></section></main>
    <script>
      const get = (name) => fetch('/api/' + name).then(async r => ({ ok: r.ok, data: await r.json() }));
      async function load() {
        ${variant === "console" ? "console.error('Fixture error');" : ""}
        const catalog = get('catalog?limit=${limit}').then(result => {
          document.querySelector('#items').innerHTML = result.ok ? '<li>Beta</li><li>Alpha</li>' : '';
          document.querySelector('#state').textContent = result.ok ? '2 items' : 'Catalog unavailable';
        });
        ${sequential ? "await catalog;" : ""}
        const activity = ${missing ? "Promise.resolve()" : "get('activity').then(() => { document.querySelector('#activity').textContent = 'Activity ready'; })"};
        await Promise.all([catalog, activity]);
        ${repeated ? "await get('catalog?limit=30');" : ""}
        document.querySelector('main').dataset.ready = 'true';
      }
      document.querySelector('#sort').onclick = () => {
        document.querySelector('#items').innerHTML = '<li>Alpha</li><li>Beta</li>';
        document.querySelector('#state').textContent = 'Sorted by name';
      };
      load();
    </script></body></html>`;
}


export async function startFixture() {
  const state = { repeatVisits: 0 };
  const server = createServer((request, response) => {
    if (request.url.startsWith("/api/")) {
      response.writeHead(state.recovery && request.url.startsWith("/api/catalog") ? 503 : 200,
        { "content-type": "application/json", "access-control-allow-origin": "*" });
      response.end("[]");
    } else if (request.url.startsWith("/two-origins?")) {
      const other = new URL(request.url, "http://fixture.test").searchParams.get("other");
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`<!doctype html><html lang="en"><head><title>Accounts</title>
        <link rel="icon" href="data:,"></head><body><main><h1>Accounts</h1><script>
        Promise.all([fetch('/api/profile'), fetch(${JSON.stringify(`${other}/api/profile`)})])
        .then(async responses => { await Promise.all(responses.map(r => r.json()));
          document.querySelector('main').dataset.ready = 'true'; });
        </script></main></body></html>`);
    } else {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(screen(request.url.slice(1), state));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    baseURL: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

export function fixtureConfig(url, variant) {
  return {
    baseURL: url, viewports: [{ width: 390, height: 844 }],
    scenarios: [{
      name: "catalog", path: `/${variant}`, ready: "main[data-ready]",
      resources: [
        { id: "catalog", pathname: "/api/catalog", query: { limit: "30" } },
        { id: "activity", pathname: "/api/activity" },
      ],
      async exercise({ page }) {
        const button = page.getByRole("button", { name: "Sort by name" });
        await button.focus();
        await page.keyboard.press("Enter");
        assert.equal(await page.getByRole("status").textContent(), "Sorted by name");
        assert.deepEqual(await page.locator("#items li").allTextContents(), ["Alpha", "Beta"]);
      },
    }],
  };
}


if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const fixture = await startFixture();
  console.log(fixture.baseURL);
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => { await fixture.close(); });
}
