# Data-loading contract

## Start independent work at the route boundary

Declare what the route needs in its loader or the stack's equivalent entry point.
Start independent requests together before waiting for one to finish. Components
read the same cache definitions. Avoid making child requests depend on mounting
behind a parent-wide spinner. Give independently useful sections their own
loading and failure treatment; concurrent fetching does not require waiting for
every section before showing any of them.

Preserve real authorization prerequisites. Do not fetch protected data before
the application has established the identity or permission it needs. Interactive
queries whose input does not yet exist, such as a newly typed search, are owned
by that interaction rather than a route's initial loader.

## One definition per resource

Keep query definitions in one application-owned folder. Each factory owns the
key, canonical parameters, request function and freshness policy. Include every
input that changes the result, including tenant/user scope where applicable.
Do not merge intentionally different views into a single misleading cache key.
Pass the query library's cancellation signal through to the transport.

For TanStack Query v5, the bundled executable example is
[catalog-queries.mjs](../checks/examples/catalog-queries.mjs). Its pattern is:

```ts
// queries/catalog.ts
export const catalogQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ["catalog", workspaceId, { limit: 30 }],
    queryFn: ({ signal }) => api.catalog(workspaceId, { limit: 30, signal }),
    staleTime: 60_000,
  });

// Route entry: initiate both before awaiting either.
const catalog = queryClient.ensureQueryData(catalogQuery(workspaceId));
const activity = queryClient.ensureQueryData(activityQuery(workspaceId));
// Await only essential data here, or use the router's supported deferred pattern.
await catalog;
// If activity is noncritical, observe its rejection and render section recovery.
void activity.catch(reportActivityLoadFailure);

// Hover/focus preload and component consumption use the identical factory.
queryClient.prefetchQuery(catalogQuery(workspaceId));
useQuery(catalogQuery(workspaceId));
```

Adapt loader/deferred APIs to the installed router and query version. A cache
entry can exist but already be stale: `ensureQueryData` and freshness-sensitive
fetching are not interchangeable. Set a deliberate freshness policy and test
the warm transition, invalidation and identity changes. Intent prefetch must work
for keyboard users and must not mutate server state.

Install the local policy by copying
[query-policy.mjs](../checks/query-policy.mjs) into the application's lint tooling.
With ESLint flat config, compose it with the application's existing parser and
file exclusions:

```js
import queryPlugin from "@tanstack/eslint-plugin-query";
import { queryPolicy } from "./tooling/query-policy.mjs";

export default [
  ...queryPlugin.configs["flat/recommended"],
  ...queryPolicy({
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    factories: ["src/queries/**/*.{js,ts}"],
  }),
  // Retain the project's TypeScript/JSX parser configuration.
];
```

The policy forbids `queryKey`/`queryFn` definitions and `queryOptions` factories
outside the declared folder, including aliased/namespace imports. It rejects
inline objects passed to query hooks and cache fetch/prefetch methods; consumers
use the factory directly. Object spreads must not redefine keys or request
functions outside that folder. It does not prove arbitrary dataflow, recognize
every custom wrapper, or ban transport calls across an entire codebase. Keep
generated clients outside this policy and review wrapper boundaries. Upstream
query lint supplies key-dependency and query-specific correctness checks.

Use equivalent rules for other query systems. Reuse the project's existing
linter; migrating a Biome application to ESLint is not a prerequisite. Preserve
the invariant with its supported AST checks or a focused contract test.

## Treat genuine dependencies at the API boundary

If request B needs IDs returned by A, a loader cannot make them independent.
Assess a screen-shaped projection or a bounded batch endpoint instead of an
N+1 fan-out. Return only the fields and aggregates the screen needs. Preserve
authorization, pagination and payload limits; frontend work does not authorize
an unrelated backend redesign. Record that dependency when an API change is
outside scope, and report the resulting limitation.

## Prove the contract

Describe the route's resources with `after` edges for prerequisites that must
all complete. Use `afterAny` when any one successful source supplies the input,
such as a listing ID returned by history or a watchlist. Declared depth uses
the longest possible path, including every alternative; a short fallback must
not hide a potentially deeper chain. Observed timing
still requires an actual successful prerequisite before the dependent request.
The ordering comparison allows `dependencyToleranceMs` (default 5 ms) for small
browser timing differences, including intercepted test responses. This does not
relax the separate 25 ms minimum overlap required for independent requests.
The runner rejects cycles,
unknown dependencies and a declared depth above `maxDepth` (default 2). A root
request has depth 1. Every required resource must be observed, with canonical query
parameters and at most its configured request count. Undeclared API calls fail.

Use `required: false` only for a request conditional on data or a branch that
may not be rendered in that scenario. Its parameters, count, failures and
dependencies are still checked if it occurs. Keep the source requests required
and assert the visible branch in `exercise`; optional requests must not hide
missing essential content or a failed load.

Under throttling, resources in the same entry/interaction phase that share
the same prerequisites must overlap: the
last must start at least `minOverlapMs` (default 25 ms) before the first finishes.
Throttling gives independent requests room to overlap without accepting a small
sequential gap as scheduling noise. This is an observed concurrency check against a declared
dependency contract, not a causal graph inferred from HAR timestamps. A late
request may come from rendering, code loading, retry, or another cause; inspect
the trace and implementation before attributing it. Record a rationale for any
budget override and keep required resources in the contract instead of hiding
them with broad URL exclusions.

The two fresh contexts prove repeatable cold-entry behavior. A separate
same-session test must prove that prefetch and consumption share one cache hit,
and that changing a result-defining parameter produces a distinct request. The
bundled cache test uses the real QueryClient and deliberately perturbs a
parameter to demonstrate failure.

References: [TanStack Query v5 query options](https://tanstack.com/query/v5/docs/framework/react/guides/query-options),
[query-key dependencies](https://tanstack.com/query/latest/docs/eslint/exhaustive-deps),
[router integration](https://tanstack.com/router/latest/docs/integrations/query).
