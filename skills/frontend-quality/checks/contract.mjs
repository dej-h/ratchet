/** Validate declared read dependencies and compare them with browser evidence. */

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function queryEntries(query = {}) {
  return Object.keys(query).sort().map((key) => [key, [].concat(query[key])]);
}

export function matchesResource(resource, url, method) {
  if (resource.origin !== url.origin || resource.pathname !== url.pathname || resource.method !== method) return false;
  const actual = Object.fromEntries([...new Set(url.searchParams.keys())]
    .map((key) => [key, url.searchParams.getAll(key)]));
  return JSON.stringify(queryEntries(actual)) === JSON.stringify(queryEntries(resource.query));
}

export function normalizeConfig(input) {
  requireCondition(input && typeof input === "object", "Export a configuration object");
  const base = new URL(input.baseURL);
  requireCondition(["http:", "https:"].includes(base.protocol), "baseURL must use HTTP(S)");
  const config = {
    passes: 2,
    viewports: [
      { width: 390, height: 844 }, { width: 1280, height: 800 },
      { width: 1440, height: 900 }, { width: 1600, height: 1000 },
    ],
    timeoutMs: 15_000,
    latencyMs: 200,
    downloadBytesPerSecond: 200_000,
    uploadBytesPerSecond: 100_000,
    apiOrigins: [base.origin],
    apiPrefixes: ["/api/"],
    ...input,
  };
  requireCondition(Number.isInteger(config.passes) && config.passes >= 2, "At least two passes are required");
  for (const field of ["timeoutMs", "latencyMs", "downloadBytesPerSecond", "uploadBytesPerSecond"]) {
    requireCondition(Number.isFinite(config[field]) && config[field] > 0, `${field} must be positive`);
  }
  requireCondition(Array.isArray(config.viewports) && config.viewports.length > 0, "Declare viewports");
  for (const size of config.viewports) {
    requireCondition(Number.isInteger(size.width) && size.width > 0
      && Number.isInteger(size.height) && size.height > 0, "Invalid viewport dimensions");
  }
  requireCondition(Array.isArray(config.apiOrigins) && config.apiOrigins.length > 0, "Declare API origins");
  for (const origin of config.apiOrigins) {
    const parsed = new URL(origin);
    requireCondition(parsed.origin === origin && ["http:", "https:"].includes(parsed.protocol),
      "apiOrigins must contain exact HTTP(S) origins");
  }
  requireCondition(Array.isArray(config.apiPrefixes) && config.apiPrefixes.length > 0
    && config.apiPrefixes.every((prefix) => typeof prefix === "string" && prefix.startsWith("/")),
  "Declare absolute API path prefixes");
  requireCondition(config.prepare === undefined || typeof config.prepare === "function", "prepare must be a function");
  requireCondition(Array.isArray(config.scenarios) && config.scenarios.length > 0, "Declare affected scenarios");
  const names = new Set();
  config.scenarios = config.scenarios.map((scenario) => {
    requireCondition(typeof scenario.name === "string" && scenario.name.trim(), "Name each scenario");
    requireCondition(!names.has(scenario.name), "Scenario names must be unique");
    names.add(scenario.name);
    requireCondition(typeof scenario.path === "string" && scenario.path.startsWith("/")
      && new URL(scenario.path, base).origin === base.origin, "Scenario paths must stay on baseURL");
    requireCondition(typeof scenario.ready === "string" && scenario.ready.trim(), "Declare observable readiness");
    requireCondition(typeof scenario.exercise === "function", "Each scenario needs interaction assertions in exercise");
    requireCondition(Array.isArray(scenario.resources), "Declare resources, or [] for a static surface");
    const normalized = { maxDepth: 2, minOverlapMs: 25, allowedAborts: [], fonts: [], ...scenario };
    requireCondition(Number.isInteger(normalized.maxDepth) && normalized.maxDepth > 0, "maxDepth must be positive");
    requireCondition(Number.isFinite(normalized.minOverlapMs) && normalized.minOverlapMs >= 0,
      "minOverlapMs must be nonnegative");
    if (normalized.maxDepth > 2 || normalized.minOverlapMs < 25) {
      requireCondition(typeof normalized.budgetRationale === "string" && normalized.budgetRationale.trim(),
        "Relaxed budgets require budgetRationale");
    }
    const ids = new Set();
    const signatures = new Set();
    normalized.resources = scenario.resources.map((resource) => {
      const item = { method: "GET", query: {}, after: [], maxRequests: 1, phase: "entry",
        origin: config.apiOrigins.length === 1 ? config.apiOrigins[0] : undefined, ...resource };
      requireCondition(typeof item.id === "string" && item.id.trim() && !ids.has(item.id), "Resource IDs must be unique");
      ids.add(item.id);
      requireCondition(typeof item.phase === "string" && item.phase.trim(), "Resource phases must be named");
      requireCondition(typeof item.pathname === "string" && item.pathname.startsWith("/")
        && !item.pathname.includes("?") && !item.pathname.includes("#"), "Resources need a pathname without query or fragment");
      requireCondition(typeof item.method === "string" && /^[A-Z]+$/.test(item.method), "Resource methods must be uppercase");
      requireCondition(config.apiOrigins.includes(item.origin),
        "Each resource needs a configured origin; declare it explicitly when multiple API origins are measured");
      requireCondition(item.query && typeof item.query === "object" && !Array.isArray(item.query)
        && Object.values(item.query).every((value) => typeof value === "string"
          || (Array.isArray(value) && value.length > 0 && value.every((part) => typeof part === "string"))),
      "Query values must be strings or nonempty string arrays");
      requireCondition(Array.isArray(item.after) && item.after.every((id) => typeof id === "string")
        && new Set(item.after).size === item.after.length, "after must contain unique resource IDs");
      requireCondition(Number.isInteger(item.maxRequests) && item.maxRequests > 0, "maxRequests must be positive");
      requireCondition(item.statuses === undefined || (Array.isArray(item.statuses) && item.statuses.length > 0
        && item.statuses.every((status) => Number.isInteger(status) && status >= 200 && status <= 599)),
      "statuses must list expected HTTP response codes");
      requireCondition(config.apiPrefixes.some((prefix) => item.pathname.startsWith(prefix)),
        "Every resource must fall within apiPrefixes");
      const signature = JSON.stringify([item.origin, item.method, item.pathname, queryEntries(item.query)]);
      requireCondition(!signatures.has(signature), "Resource matches must be distinct");
      signatures.add(signature);
      return item;
    });
    const byId = new Map(normalized.resources.map((resource) => [resource.id, resource]));
    const depth = (id, visiting = new Set()) => {
      requireCondition(byId.has(id), `Unknown dependency: ${id}`);
      requireCondition(!visiting.has(id), "Resource dependencies must be acyclic");
      const next = new Set(visiting).add(id);
      return 1 + Math.max(0, ...byId.get(id).after.map((parent) => depth(parent, next)));
    };
    normalized.declaredDepth = Math.max(0, ...normalized.resources.map(({ id }) => depth(id)));
    requireCondition(normalized.declaredDepth <= normalized.maxDepth,
      `Declared dependency depth ${normalized.declaredDepth} exceeds ${normalized.maxDepth}`);
    requireCondition(Array.isArray(normalized.allowedAborts)
      && normalized.allowedAborts.every((id) => byId.has(id)), "allowedAborts must name declared resources");
    requireCondition(Array.isArray(normalized.fonts) && normalized.fonts.every((font) =>
      typeof font.selector === "string" && font.selector.trim()
      && typeof font.family === "string" && font.family.trim()), "fonts need selector and family");
    return normalized;
  });
  return config;
}

export function checkRequests(scenario, requests) {
  const failures = [];
  const first = new Map();
  for (const request of requests) {
    if (!request.resource) {
      if (["GET", "HEAD"].includes(request.method)) failures.push("Undeclared or noncanonical API read");
    }
    const allowedAbort = request.failure && /abort|cancel/i.test(request.failure)
      && scenario.allowedAborts.includes(request.resource);
    if (request.failure && !allowedAbort) failures.push(`Request failed: ${request.resource || "undeclared"}`);
    const resource = scenario.resources.find((item) => item.id === request.resource);
    if (request.status !== null && (resource?.statuses
      ? !resource.statuses.includes(request.status) : request.status >= 400)) {
      failures.push(`HTTP ${request.status}: ${request.resource || "undeclared"}`);
    }
    if (request.status === null && !allowedAbort) failures.push(`No HTTP response: ${request.resource || "undeclared"}`);
    if (request.endMs === null) failures.push(`Unfinished request: ${request.resource || "undeclared"}`);
  }
  for (const resource of scenario.resources) {
    const matches = requests.filter((request) => request.resource === resource.id);
    if (matches.length === 0) failures.push(`Missing required resource: ${resource.id}`);
    if (matches.length > resource.maxRequests) failures.push(`Duplicate resource: ${resource.id} (${matches.length} requests)`);
    if (matches.length) first.set(resource.id, matches[0]);
  }
  const groups = new Map();
  for (const resource of scenario.resources) {
    const key = JSON.stringify([resource.phase, [...resource.after].sort()]);
    if (!groups.has(key)) groups.set(key, []);
    const request = first.get(resource.id);
    if (request?.endMs !== null && request?.endMs !== undefined) groups.get(key).push(request);
    if (request) {
      for (const parent of resource.after) {
        const prerequisite = first.get(parent);
        if (prerequisite?.endMs !== null && prerequisite?.endMs !== undefined
          && request.startMs < prerequisite.endMs) {
          failures.push(`Resource ${resource.id} started before declared prerequisite ${parent} completed`);
        }
      }
    }
  }
  for (const group of groups.values()) {
    if (group.length > 1 && Math.min(...group.map((request) => request.endMs))
      - Math.max(...group.map((request) => request.startMs)) < scenario.minOverlapMs) {
      failures.push(`Independent requests did not overlap: ${group.map((request) => request.resource).join(", ")}`);
    }
  }
  return failures;
}
