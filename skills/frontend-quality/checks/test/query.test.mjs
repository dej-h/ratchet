import assert from "node:assert/strict";
import test from "node:test";
import { ESLint } from "eslint";
import parser from "@typescript-eslint/parser";
import queryPlugin from "@tanstack/eslint-plugin-query";
import { QueryClient } from "@tanstack/react-query";
import { catalogQueries } from "../examples/catalog-queries.mjs";
import { queryPolicy } from "../query-policy.mjs";

const lint = new ESLint({ overrideConfigFile: true, overrideConfig: [
  { files: ["src/**/*.ts"], languageOptions: { parser } },
  ...queryPlugin.configs["flat/recommended"],
  ...queryPolicy({ files: ["src/**/*.ts"], factories: ["src/queries/**/*.ts"] }),
] });

test("consumers use canonical definitions while factory modules retain query ownership", async () => {
  const [consumer] = await lint.lintText(`
    import { useQuery } from '@tanstack/react-query';
    useQuery(catalogQuery('workspace'));
    client.prefetchQuery(catalogQuery('workspace'));
    const { queryKey } = catalogQuery('workspace');
  `, { filePath: "src/screen.ts" });
  assert.deepEqual(consumer.messages, []);
  const [factory] = await lint.lintText(`
    import { queryOptions } from '@tanstack/react-query';
    export const catalogQuery = (id: string) => queryOptions({
      queryKey: ['catalog', id], queryFn: () => api.catalog(id)
    });
  `, { filePath: "src/queries/catalog.ts" });
  assert.deepEqual(factory.messages, []);
});

test("inline, aliased, namespace and spread overrides cannot redefine query identity in consumers", async () => {
  for (const source of [
    "import { useQuery as read } from '@tanstack/react-query'; read({queryKey:['x'],queryFn:fetch});",
    "import * as q from '@tanstack/react-query'; q.useQuery({queryKey:['x'],queryFn:fetch});",
    "import { queryOptions as make } from '@tanstack/react-query'; make(options);",
    "client.prefetchQuery({...catalogQuery(id),queryKey:['other']});",
    "const options = {queryKey:['x'],queryFn:fetch};",
    "client['ensureQueryData']({ ...catalogQuery(id) });",
  ]) {
    const [result] = await lint.lintText(source, { filePath: "src/screen.ts" });
    assert.ok(result.messages.some((message) => message.ruleId === "ratchet-query/canonical-queries"), source);
  }
});

test("upstream query lint detects a result-defining parameter missing from the cache key", async () => {
  const [result] = await lint.lintText(`
    import { queryOptions } from '@tanstack/react-query';
    export const catalogQuery = (id: string) => queryOptions({
      queryKey: ['catalog'], queryFn: () => api.catalog(id)
    });
  `, { filePath: "src/queries/catalog.ts" });
  assert.ok(result.messages.some((message) => message.ruleId === "@tanstack/query/exhaustive-deps"));
});

test("prefetch, loader and consumption reuse a real cache entry; scope and invalidation fetch anew", async () => {
  const calls = [];
  const queries = catalogQueries({
    async catalog(workspace, { limit, signal }) {
      assert.ok(signal instanceof AbortSignal);
      calls.push({ workspace, limit });
      return [{ name: "Alpha" }];
    },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await client.prefetchQuery(queries.catalog("one"));
    await client.ensureQueryData(queries.catalog("one"));
    assert.deepEqual(await client.fetchQuery(queries.catalog("one")), [{ name: "Alpha" }]);
    assert.deepEqual(calls, [{ workspace: "one", limit: 30 }]);
    await client.fetchQuery(queries.catalog("two"));
    assert.equal(calls.length, 2);
    await client.invalidateQueries({ queryKey: ["catalog", "one"] });
    await client.fetchQuery(queries.catalog("one"));
    assert.equal(calls.length, 3);
  } finally { client.clear(); }
});

test("a parameter mismatch defeats prefetch reuse and is visible in the transport count", async () => {
  let reads = 0;
  const queries = catalogQueries({ async catalog() { reads++; return []; } });
  const client = new QueryClient();
  try {
    await client.prefetchQuery(queries.catalog("one"));
    await client.fetchQuery({ ...queries.catalog("one"), queryKey: ["catalog", "one", { limit: 31 }] });
    assert.equal(reads, 2);
  } finally { client.clear(); }
});
