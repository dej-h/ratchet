# Run and interpret the checks

The checks require Node 24 and Chromium. Resolve `SKILL_DIR` to the directory
containing this skill (the harness may supply it). Commands run from the target
application's directory, so config paths stay application-relative.

```bash
node "$SKILL_DIR/scripts/run-checks.mjs" --install-browser
node "$SKILL_DIR/scripts/run-checks.mjs" ./frontend-quality.config.mjs --output /tmp/frontend-quality-run
```

The launcher copies the locked runtime into the user cache and installs its
dependencies with `npm ci --omit=dev --ignore-scripts`. It never writes into the
plugin. `RATCHET_FRONTEND_CACHE_ROOT` overrides the cache location;
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an existing Chromium binary.
The browser-install command is explicit, so a browser run does not silently
download it. CI can run `npm ci` in a writable copy of `checks/`, then
`npx playwright install --with-deps chromium` and `node audit.mjs ...` directly.

## Application configuration

Export a configuration object from a JavaScript module. This example uses only
Playwright's supplied `page` API and Node's built-in assertions; the application
does not need to import the checker's dependencies.

```js
import assert from "node:assert/strict";

export default {
  baseURL: "http://127.0.0.1:3000",
  viewports: [{ width: 390, height: 844 }, { width: 1280, height: 800 }],
  // Defaults: two passes, 200 ms network latency, 1.6 Mbps download.
  // Add the real API origins when the API is hosted separately.
  apiOrigins: ["http://127.0.0.1:3000"],
  apiPrefixes: ["/api/"],
  // Optional: async prepare({ context, page }) { ... authenticate ... }
  scenarios: [{
    name: "catalog-normal",
    path: "/catalog",
    ready: "[data-catalog-ready]",
    resources: [
      { id: "catalog", pathname: "/api/catalog", query: { limit: "30" } },
      { id: "activity", pathname: "/api/activity" },
    ],
    async exercise({ page }) {
      const sort = page.getByRole("button", { name: "Sort by name" });
      await sort.focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("th[aria-sort]").getAttribute("aria-sort"), "ascending");
    },
  }],
};
```

Every scenario needs a nonempty `ready` selector and an `exercise` callback.
Readiness must mean the relevant UI settled; it is not `networkidle`. Required
requests must have finished before the final assertion, so point readiness at
the actual completed state or wait explicitly inside `exercise`. Each resource
defaults to `after: []`, `method: "GET"`, and `maxRequests: 1`. Query parameters
match exactly, including repeated values supplied as arrays. Declare separate
resources for intentionally different parameter sets. All matching origins and
API prefixes are checked; do not omit a cross-origin API to make a route pass.

Add separate scenarios for affected empty, filtered, loading and error states,
using controlled API responses in `prepare` when needed. `prepare` runs before
measurement, so authentication/setup requests do not count as route data.
For an intentional failed response, declare the resource's expected `statuses`
(for example `[503]`) and assert the recovery UI. Only the browser's matching
HTTP resource-error message is exempted; application console errors still fail.
Real aborted requests fail unless the scenario explicitly lists the resource
in `allowedAborts`; use that only for expected cancellation and assert the
replacement result in `exercise`.

For fonts, optionally add `fonts: [{ selector: "h1", family: "Open Sans" }]`
to a scenario. Use selectors on elements that actually contain text. The check
inspects fonts used to render glyphs, not just computed `font-family` strings.

## Evidence and review

The command exits 0 only when every scenario, viewport and pass succeeds; 1 is
a quality failure and 2 is invalid configuration or unavailable tooling. It
writes `report.json` plus a screenshot per measured run. The report records
request IDs, methods, statuses and timings, not headers, bodies, query values
or authentication state. Store artifacts according to the target application's
existing test-data policy.

Review screenshots for hierarchy, readable content, deliberate emphasis,
cohesion and preservation of approved elements. Compare related pages at the
same viewport and state. The automated checks do not score taste, inspect every
internal scroll container, establish full accessibility compliance, or observe
server-side/worker/WebSocket request chains. Service workers are blocked for
the measured runs; cover service-worker behavior separately when applicable.

The runner measures GET/HEAD fetch/XHR reads. Writes made by `exercise` still
receive HTTP and browser-error checks but do not enter the read dependency
graph. Declare a separate resource with its method when a write is part of the
loading contract. Persistent polling/streaming and expected recovery responses
need focused application tests instead of pretending to be a finite page load.

The second reviewer must challenge coverage as well as results: a perfect
report for only the normal state does not verify an affected error state.
Review the exact delivered revision. Any source or scenario change invalidates
the earlier result and requires the affected checks and review again.
