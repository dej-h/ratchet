import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { audit } from "../audit.mjs";
import { startFixture, fixtureConfig } from "./fixtures/catalog-fixture.mjs";

let fixture;
let baseURL;
let directory;

before(async () => {
  directory = process.env.RATCHET_FRONTEND_TEST_ARTIFACTS
    || await mkdtemp(path.join(tmpdir(), "ratchet-frontend-browser-"));
  fixture = await startFixture();
  baseURL = fixture.baseURL;
});

after(async () => {
  await fixture.close();
  if (!process.env.RATCHET_FRONTEND_TEST_ARTIFACTS) await rm(directory, { recursive: true, force: true });
});

test("parallel route entry passes both cold runs with screenshots and redacted request evidence", async () => {
  const output = path.join(directory, "catalog");
  const config = fixtureConfig(baseURL, "catalog");
  config.viewports.push({ width: 1280, height: 800 });
  const report = await audit(config, output);
  assert.equal(report.status, "PASS", JSON.stringify(report));
  assert.equal(report.runs.length, 4);
  for (const run of report.runs) {
    assert.equal((await readFile(path.join(output, run.screenshot))).subarray(1, 4).toString(), "PNG");
    assert.deepEqual(run.requests.map((request) => request.resource).sort(), ["activity", "catalog"]);
    assert.ok(run.requests.every((request) => request.endMs > request.startMs));
  }
  const saved = await readFile(path.join(output, "report.json"), "utf8");
  assert.equal(saved.includes("limit=30"), false);
  assert.equal(saved.includes("http://"), false);
});

test("failed interactions retain their diagnostics and do not skip independent screen checks", async () => {
  const config = fixtureConfig(baseURL, "accessible-name");
  config.scenarios[0].exercise = async ({ page }) => {
    await page.evaluate(() => { document.body.style.width = "2000px"; });
    assert.match(await page.getByRole("status").textContent(), /Catalog unavailable/, "Activity recovery must be visible");
  };
  const report = await audit(config, path.join(directory, "interaction-failure"));
  assert.equal(report.status, "FAIL");
  for (const run of report.runs) {
    assert.equal(run.checks.interaction, "FAIL");
    assert.equal(run.checks.overflow, "FAIL");
    assert.equal(run.checks.accessibility, "FAIL");
    assert.equal(run.checks.requests, "PASS");
    assert.equal(run.checks.screenshot, "PASS");
    assert.ok(run.failures.some((failure) => failure.includes("Activity recovery must be visible")));
    const assertion = run.diagnostics.find((diagnostic) => diagnostic.probe === "interaction");
    assert.ok(assertion.actual.includes("2 items"));
    assert.ok(assertion.expected.includes("Catalog unavailable"));
    assert.ok(run.failures.includes("Page overflows horizontally"));
    assert.ok(run.accessibility.some((violation) => violation.id === "button-name"));
  }
});

test("holding an independent response does not turn concurrent initiation into a waterfall", async () => {
  const config = fixtureConfig(baseURL, "catalog");
  config.prepare = async ({ page }) => {
    const activityFinished = page.waitForResponse('**/api/activity').then(response => response.finished());
    await page.route('**/api/catalog?limit=30', async route => {
      await activityFinished;
      await route.continue();
    });
  };
  const report = await audit(config, path.join(directory, "held-independent-response"));
  assert.equal(report.status, "PASS", JSON.stringify(report));
});

test("expected HTTP failures can verify recovery without masking application errors", async () => {
  const config = fixtureConfig(baseURL, "recovery");
  config.scenarios[0].resources[0].statuses = [503];
  config.scenarios[0].exercise = async ({ page }) => {
    assert.equal(await page.getByRole("status").textContent(), "Catalog unavailable");
    assert.equal(await page.locator("#activity").textContent(), "Activity ready");
    assert.equal(await page.locator("#items li").count(), 0);
  };
  const report = await audit(config, path.join(directory, "recovery"));
  assert.equal(report.status, "PASS", JSON.stringify(report));
  config.scenarios[0].exercise = async ({ page }) => { await page.evaluate(() => console.error("Application failure")); };
  const broken = await audit(config, path.join(directory, "recovery-console"));
  assert.equal(broken.status, "FAIL");
  assert.ok(broken.runs.every((run) => run.failures.some((failure) => failure.includes("Browser console error"))));
});

test("declaring a font does not pass when the browser actually renders a fallback", async () => {
  const config = fixtureConfig(baseURL, "catalog");
  config.scenarios[0].fonts = [{ selector: "h1", family: "Uninstalled Fixture Font" }];
  const report = await audit(config, path.join(directory, "font"));
  assert.equal(report.status, "FAIL");
  assert.ok(report.runs.every((run) => run.failures.some((failure) => failure.includes("Expected rendered font"))));
});

test("identical resource paths on different origins remain distinct in the browser", async () => {
  const other = await startFixture();
  try {
    const config = {
      baseURL, apiOrigins: [baseURL, other.baseURL], viewports: [{ width: 390, height: 844 }],
      scenarios: [{ name: "two-origins", path: `/two-origins?other=${encodeURIComponent(other.baseURL)}`, ready: "main[data-ready]",
        resources: [
          { id: "billing", origin: baseURL, pathname: "/api/profile" },
          { id: "crm", origin: other.baseURL, pathname: "/api/profile" },
        ],
        async exercise({ page }) { assert.equal(await page.getByRole("heading").textContent(), "Accounts"); },
      }],
    };
    const report = await audit(config, path.join(directory, "two-origins"));
    assert.equal(report.status, "PASS", JSON.stringify(report));
    for (const run of report.runs) {
      assert.deepEqual(run.requests.map(({ resource }) => resource).sort(), ["billing", "crm"]);
    }
  } finally { await other.close(); }
});

test("interaction-triggered reads have explicit phases instead of being mistaken for entry waterfalls", async () => {
  const config = fixtureConfig(baseURL, "catalog");
  config.scenarios[0].resources.push({ id: "details", pathname: "/api/details", phase: "inspect" });
  config.scenarios[0].exercise = async ({ page, markPhase }) => {
    markPhase("inspect");
    assert.deepEqual(await page.evaluate(async () => (await fetch("/api/details")).json()), []);
  };
  const report = await audit(config, path.join(directory, "interaction-phase"));
  assert.equal(report.status, "PASS", JSON.stringify(report));
  config.scenarios[0].exercise = async ({ page }) => {
    await page.evaluate(async () => (await fetch("/api/details")).json());
  };
  const unmarked = await audit(config, path.join(directory, "unmarked-phase"));
  assert.equal(unmarked.status, "FAIL");
  assert.ok(unmarked.runs.every((run) => run.checks.requests === "FAIL"
    && run.failures.some((failure) => failure.includes("before phase inspect"))));
});

test("browser defects fail their intended checks under the same route contract", async (suite) => {
  for (const [variant, finding] of [
    ["waterfall", "Independent requests did not overlap"],
    ["duplicate", "Duplicate resource"],
    ["parameters", "Undeclared or noncanonical API read"],
    ["overflow", "Page overflows horizontally"],
    ["accessible-name", "Accessibility: button-name"],
    ["console", "Browser console error"],
  ]) {
    await suite.test(variant, async () => {
      const report = await audit(fixtureConfig(baseURL, variant), path.join(directory, variant));
      assert.equal(report.status, "FAIL");
      assert.ok(report.runs.every((run) => run.failures.some((failure) => failure.includes(finding))), JSON.stringify(report));
    });
  }
});

test("a passing first run cannot hide a second-run missing resource", async () => {
  const report = await audit(fixtureConfig(baseURL, "repeat"), path.join(directory, "repeat"));
  assert.equal(report.runs[0].status, "PASS", JSON.stringify(report));
  assert.equal(report.runs[1].status, "FAIL");
  assert.equal(report.status, "FAIL");
  assert.ok(report.runs[1].failures.includes("Missing required resource: activity"));
});
