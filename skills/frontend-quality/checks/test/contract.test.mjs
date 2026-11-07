import assert from "node:assert/strict";
import test from "node:test";
import { checkRequests, matchesResource, normalizeConfig } from "../contract.mjs";

const base = (resources) => ({ baseURL: "http://localhost:3000", scenarios: [{
  name: "catalog", path: "/catalog", ready: "main", exercise() {}, resources,
}] });
const requests = (times) => times.map(([resource, startMs, endMs]) =>
  ({ resource, method: "GET", status: 200, startMs, endMs, failure: null }));

test("a two-stage graph admits parallel siblings and records its declared depth", () => {
  const config = normalizeConfig(base([
    { id: "identity", pathname: "/api/identity" },
    { id: "catalog", pathname: "/api/catalog", after: ["identity"] },
    { id: "activity", pathname: "/api/activity", after: ["identity"] },
  ]));
  assert.equal(config.scenarios[0].declaredDepth, 2);
  assert.deepEqual(checkRequests(config.scenarios[0], requests([
    ["identity", 0, 200], ["catalog", 210, 500], ["activity", 215, 450],
  ])), []);
});

test("invalid dependency graphs and unaudited budget relaxations fail before a browser is launched", () => {
  for (const resources of [
    [{ id: "a", pathname: "/api/a", after: ["missing"] }],
    [{ id: "a", pathname: "/api/a", after: ["a"] }],
    [{ id: "a", pathname: "/api/a" }, { id: "b", pathname: "/api/b", after: ["a"] },
      { id: "c", pathname: "/api/c", after: ["b"] }],
  ]) assert.throws(() => normalizeConfig(base(resources)));
  const config = base([]);
  config.scenarios[0].maxDepth = 3;
  assert.throws(() => normalizeConfig(config), /budgetRationale/);
  config.scenarios[0].budgetRationale = "External identity resolution cannot be changed in this task";
  assert.doesNotThrow(() => normalizeConfig(config));
});

test("request evidence rejects serialization, duplication, missing and unfinished reads", () => {
  const scenario = normalizeConfig(base([
    { id: "catalog", pathname: "/api/catalog" },
    { id: "activity", pathname: "/api/activity" },
  ])).scenarios[0];
  assert.match(checkRequests(scenario, requests([["catalog", 0, 200], ["activity", 300, 500]])).join(), /did not overlap/);
  assert.match(checkRequests(scenario, requests([["catalog", 0, 200], ["activity", 202, 402]])).join(), /did not overlap/);
  assert.match(checkRequests(scenario, requests([["catalog", 0, 200], ["catalog", 10, 210]])).join(), /Duplicate resource.*Missing required/s);
  assert.match(checkRequests(scenario, requests([["catalog", 0, null]])).join(), /Unfinished/);
});

test("canonical parameters include repeated values without depending on parameter name ordering", () => {
  const resource = { pathname: "/api/catalog", method: "GET", query: { limit: "30", tag: ["a", "b"] } };
  assert.equal(matchesResource(resource, new URL("https://example.test/api/catalog?tag=a&limit=30&tag=b"), "GET"), true);
  assert.equal(matchesResource(resource, new URL("https://example.test/api/catalog?tag=a&limit=31&tag=b"), "GET"), false);
});
