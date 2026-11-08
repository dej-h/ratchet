#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspect, parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { checkRequests, matchesResource, normalizeConfig } from "./contract.mjs";

async function probe(run, name, operation) {
  const failuresBefore = run.failures.length;
  try {
    await operation();
  } catch (error) {
    const diagnostic = { probe: name, name: error?.name || "Error", message: error?.message || String(error) };
    if (error && typeof error === "object") {
      for (const field of ["actual", "expected", "operator"]) {
        if (field in error) diagnostic[field] = inspect(error[field], {
          depth: 3, maxArrayLength: 30, maxStringLength: 2000,
        });
      }
    }
    run.diagnostics.push(diagnostic);
    run.failures.push(`${name}: ${diagnostic.name}: ${diagnostic.message}`);
  }
  run.checks[name] = run.failures.length === failuresBefore ? "PASS" : "FAIL";
}

async function inspectRun(browser, config, scenario, viewport, pass, index, output) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const page = await context.newPage();
  page.setDefaultTimeout(config.timeoutMs);
  const failures = [];
  const consoleErrors = [];
  const requestErrors = [];
  const requests = [];
  const tracked = new Map();
  const screenshot = `pass-${pass}-scenario-${index}-${viewport.width}x${viewport.height}.png`;
  const run = { scenario: scenario.name, viewport, pass, screenshot, requests, failures, checks: {}, diagnostics: [] };
  let session;
  try {
    if (config.prepare) await config.prepare({ context, page, scenario, pass, viewport });
    session = await context.newCDPSession(page);
    await session.send("Network.enable");
    await session.send("Network.setCacheDisabled", { cacheDisabled: true });
    await session.send("Network.emulateNetworkConditions", {
      offline: false, latency: config.latencyMs,
      downloadThroughput: config.downloadBytesPerSecond,
      uploadThroughput: config.uploadBytesPerSecond,
    });
    const epoch = Date.now();
    const phases = new Map([["entry", 0]]);
    run.phases = { entry: 0 };
    const markPhase = (name) => {
      if (phases.has(name) || !scenario.resources.some((resource) => resource.phase === name)) {
        throw new Error("Mark each declared interaction phase once, immediately before its action");
      }
      const time = Date.now() - epoch;
      phases.set(name, time);
      run.phases = Object.fromEntries(phases);
    };
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push({ text: message.text(), url: message.location().url });
    });
    page.on("pageerror", (error) => consoleErrors.push({ text: error.message, pageError: true }));
    page.on("request", (request) => {
      if (!["fetch", "xhr"].includes(request.resourceType())) return;
      const url = new URL(request.url());
      if (!config.apiPrefixes.some((prefix) => url.pathname.startsWith(prefix))) return;
      if (!config.apiOrigins.includes(url.origin)) {
        requestErrors.push("API request uses an undeclared origin");
        return;
      }
      const resource = scenario.resources.find((item) => matchesResource(item, url, request.method()));
      if (resource && !phases.has(resource.phase)) {
        requestErrors.push(`Resource ${resource.id} started before phase ${resource.phase} was marked`);
      }
      const record = { resource: resource?.id ?? null, method: request.method(), status: null,
        startMs: Date.now() - epoch, endMs: null, failure: null };
      requests.push(record);
      tracked.set(request, record);
    });
    page.on("response", (response) => {
      const record = tracked.get(response.request());
      if (record) record.status = response.status();
    });
    const finish = (request, failed) => {
      const record = tracked.get(request);
      if (!record) return;
      const timing = request.timing();
      record.endMs = Date.now() - epoch;
      if (timing.startTime > 0 && timing.responseEnd >= 0) {
        record.networkStartMs = timing.startTime - epoch;
        record.networkEndMs = record.networkStartMs + timing.responseEnd;
      }
      if (failed) record.failure = request.failure()?.errorText ?? "request failed";
    };
    page.on("requestfinished", (request) => finish(request, false));
    page.on("requestfailed", (request) => finish(request, true));
    await probe(run, "navigation", async () => {
      const response = await page.goto(new URL(scenario.path, config.baseURL).href,
        { waitUntil: "domcontentloaded", timeout: config.timeoutMs });
      if (!response || response.status() >= 400) failures.push("Route navigation failed");
      await page.locator(scenario.ready).waitFor({ state: "visible" });
    });
    if (run.checks.navigation === "PASS") {
      await probe(run, "interaction", () => scenario.exercise({ page, context, pass, viewport, markPhase }));
    } else run.checks.interaction = "BLOCKED";
  } catch (error) {
    failures.push(`Scenario setup failed: ${error.message}`);
    run.checks.navigation = "BLOCKED";
    run.checks.interaction = "BLOCKED";
  } finally {
    await probe(run, "overflow", async () => {
      const overflow = await page.evaluate(() =>
        Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0) > innerWidth + 1);
      if (overflow) failures.push("Page overflows horizontally");
    });
    await probe(run, "accessibility", async () => {
      const accessibility = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      run.accessibility = accessibility.violations.map((violation) => ({
        id: violation.id, impact: violation.impact,
        targets: violation.nodes.map((node) => node.target),
      }));
      for (const violation of run.accessibility) failures.push(`Accessibility: ${violation.id}`);
    });
    if (scenario.fonts.length) await probe(run, "fonts", async () => {
      await page.evaluate(() => document.fonts.ready);
      await session.send("DOM.enable");
      await session.send("CSS.enable");
      const { root } = await session.send("DOM.getDocument");
      for (const font of scenario.fonts) {
        const { nodeId } = await session.send("DOM.querySelector", { nodeId: root.nodeId, selector: font.selector });
        const rendered = nodeId ? await session.send("CSS.getPlatformFontsForNode", { nodeId }) : { fonts: [] };
        if (!rendered.fonts.some((item) => item.glyphCount > 0
          && item.familyName.toLowerCase() === font.family.toLowerCase())) {
          failures.push(`Expected rendered font ${font.family} at ${font.selector}`);
        }
      }
    });
    else run.checks.fonts = "SKIP";
    await probe(run, "screenshot", () => page.screenshot({
      path: path.join(output, screenshot), fullPage: true, timeout: config.timeoutMs,
    }));
    await probe(run, "requests", async () => {
      failures.push(...requestErrors, ...checkRequests(scenario, requests));
    });
    await probe(run, "console", async () => {
      for (const message of consoleErrors) {
        const expectedHTTP = message.text.startsWith("Failed to load resource:") && message.url
          && scenario.resources.some((resource) => resource.statuses?.some((status) => status >= 400)
            && matchesResource(resource, new URL(message.url), resource.method)
            && requests.some((request) => request.resource === resource.id
              && resource.statuses.includes(request.status) && request.status >= 400));
        if (!expectedHTTP) failures.push(`${message.pageError ? "Uncaught page error" : "Browser console error"}: ${message.text}`);
      }
    });
    run.declaredDepth = scenario.declaredDepth;
    run.status = failures.length ? "FAIL" : "PASS";
    await context.close();
  }
  return run;
}

export async function audit(input, output) {
  const config = normalizeConfig(input);
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  const report = { status: "PASS", runs: [] };
  try {
    for (let pass = 1; pass <= config.passes; pass++) {
      for (const [index, scenario] of config.scenarios.entries()) {
        for (const viewport of config.viewports) {
          report.runs.push(await inspectRun(browser, config, scenario, viewport, pass, index, output));
        }
      }
    }
    if (report.runs.some((run) => run.status === "FAIL")) report.status = "FAIL";
  } catch (error) {
    report.status = "BLOCKED";
    throw error;
  } finally {
    await browser.close();
    await writeFile(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let output;
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true,
      options: { output: { type: "string" } } });
    if (positionals.length !== 1 || !values.output) {
      throw new Error("Usage: audit.mjs CONFIG.mjs --output DIRECTORY");
    }
    output = path.resolve(values.output);
    const { default: config } = await import(pathToFileURL(path.resolve(positionals[0])).href);
    const report = await audit(config, output);
    console.log(`${report.status}: ${report.runs.length} measured runs; ${path.join(output, "report.json")}`);
    process.exitCode = report.status === "PASS" ? 0 : 1;
  } catch (error) {
    if (output) {
      await mkdir(output, { recursive: true });
      await writeFile(path.join(output, "report.json"), `${JSON.stringify({ status: "BLOCKED", reason: error.message })}\n`);
    }
    console.error(`BLOCKED: ${error.message}`);
    process.exitCode = 2;
  }
}
