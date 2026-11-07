import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { audit } from "../audit.mjs";
import { startFixture, fixtureConfig } from "../examples/catalog-fixture.mjs";

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
  const report = await audit(fixtureConfig(baseURL, "catalog"), output);
  assert.equal(report.status, "PASS", JSON.stringify(report));
  assert.equal(report.runs.length, 2);
  for (const run of report.runs) {
    assert.equal((await readFile(path.join(output, run.screenshot))).subarray(1, 4).toString(), "PNG");
    assert.deepEqual(run.requests.map((request) => request.resource).sort(), ["activity", "catalog"]);
    assert.ok(run.requests.every((request) => request.endMs > request.startMs));
  }
  const saved = await readFile(path.join(output, "report.json"), "utf8");
  assert.equal(saved.includes("limit=30"), false);
  assert.equal(saved.includes("http://"), false);
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
