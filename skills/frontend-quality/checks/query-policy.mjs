/** ESLint flat-config policy for canonical TanStack Query resource factories. */

const hooks = new Set(["useQuery", "useSuspenseQuery", "useInfiniteQuery", "useSuspenseInfiniteQuery"]);
const factories = new Set(["queryOptions", "infiniteQueryOptions"]);
const cacheMethods = new Set(["ensureQueryData", "fetchQuery", "prefetchQuery", "fetchInfiniteQuery",
  "ensureInfiniteQueryData", "prefetchInfiniteQuery"]);
const packages = new Set(["@tanstack/react-query", "@tanstack/vue-query", "@tanstack/solid-query",
  "@tanstack/svelte-query", "@tanstack/angular-query-experimental"]);

const canonicalQueries = {
  meta: {
    type: "problem", schema: [],
    messages: {
      ownership: "Define query keys and request functions in the canonical query factory folder.",
      factory: "Create queryOptions only in the canonical query factory folder.",
      inline: "Pass the canonical query factory directly instead of an inline options object.",
    },
  },
  create(context) {
    const imports = new Map();
    const namespaces = new Set();
    function importedName(callee) {
      if (callee.type === "Identifier") return imports.get(callee.name);
      if (callee.type === "MemberExpression" && callee.object.type === "Identifier"
        && namespaces.has(callee.object.name)) return memberName(callee);
      return undefined;
    }
    return {
      ImportDeclaration(node) {
        if (!packages.has(node.source.value)) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportNamespaceSpecifier") namespaces.add(specifier.local.name);
          if (specifier.type === "ImportSpecifier") {
            imports.set(specifier.local.name, specifier.imported.name ?? specifier.imported.value);
          }
        }
      },
      Property(node) {
        if (node.parent.type !== "ObjectExpression") return;
        const key = node.computed ? node.key.value : node.key.name ?? node.key.value;
        if (["queryKey", "queryFn"].includes(key)) context.report({ node, messageId: "ownership" });
      },
      CallExpression(node) {
        const name = importedName(node.callee);
        if (factories.has(name)) context.report({ node, messageId: "factory" });
        const cacheCall = node.callee.type === "MemberExpression" && cacheMethods.has(memberName(node.callee));
        if ((hooks.has(name) || cacheCall) && node.arguments[0]?.type === "ObjectExpression") {
          context.report({ node, messageId: "inline" });
        }
      },
    };
  },
};

function memberName(node) {
  return node.computed ? node.property.value : node.property.name;
}

export function queryPolicy({ files, factories: factoryFiles }) {
  if (!Array.isArray(files) || !files.length || !Array.isArray(factoryFiles) || !factoryFiles.length) {
    throw new Error("queryPolicy requires consumer files and canonical factory globs");
  }
  return [{
    files,
    ignores: factoryFiles,
    plugins: { "ratchet-query": { rules: { "canonical-queries": canonicalQueries } } },
    rules: { "ratchet-query/canonical-queries": "error" },
  }];
}
