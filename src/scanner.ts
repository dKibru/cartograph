import fs from "node:fs/promises";
import path from "node:path";

const supportedExtensions = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs"
]);

const ignoredDirectories = new Set([
  ".cartograph",
  ".eve",
  ".git",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".turbo",
  ".vite",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "vendor"
]);

export async function scanRepo(repoRoot) {
  const startedAt = new Date().toISOString();
  const files = await collectFiles(repoRoot);
  const aliases = await loadAliases(repoRoot);
  const records = [];
  const byRelativePath = new Map();

  for (const file of files) {
    const content = await fs.readFile(file.absolutePath, "utf8");
    const record = analyzeFile(repoRoot, file.absolutePath, content);
    records.push(record);
    byRelativePath.set(record.path, record);
  }

  const edges = [];
  for (const record of records) {
    for (const specifier of record.imports) {
      const target = resolveImport(record.path, specifier, byRelativePath, aliases);
      edges.push({
        from: record.path,
        to: target ?? specifier,
        kind: target ? "internal-import" : "external-import",
        specifier
      });
    }
  }

  const modules = summarizeModules(records, edges);
  const hotspots = rankHotspots(records, edges);
  const entrypoints = records
    .filter((record) => record.roles.length > 0)
    .sort((a, b) => b.roles.length - a.roles.length || a.path.localeCompare(b.path))
    .slice(0, 20);

  return {
    schemaVersion: 1,
    generatedAt: startedAt,
    repo: {
      name: path.basename(repoRoot),
      root: repoRoot
    },
    summary: {
      files: records.length,
      edges: edges.length,
      modules: modules.length,
      externalImports: edges.filter((edge) => edge.kind === "external-import").length
    },
    modules,
    files: records,
    edges,
    hotspots,
    entrypoints
  };
}

async function collectFiles(repoRoot) {
  const result = [];

  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          await walk(absolutePath);
        }
        continue;
      }

      if (entry.isFile() && supportedExtensions.has(path.extname(entry.name)) && !entry.name.endsWith(".d.ts")) {
        result.push({
          absolutePath,
          relativePath: normalizePath(path.relative(repoRoot, absolutePath))
        });
      }
    }
  }

  await walk(repoRoot);
  return result.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function analyzeFile(repoRoot, absolutePath, content) {
  const relativePath = normalizePath(path.relative(repoRoot, absolutePath));
  const imports = extractImports(content);
  const exports = extractExports(content);
  const routes = extractRoutes(relativePath, content);
  const roles = inferRoles(relativePath, content, routes);

  return {
    path: relativePath,
    module: inferModule(relativePath),
    extension: path.extname(relativePath),
    lines: content.split(/\r?\n/).length,
    imports,
    exports,
    routes,
    roles
  };
}

function extractImports(content) {
  const imports = new Set();
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/g,
    /\brequire\(["']([^"']+)["']\)/g,
    /\bimport\(["']([^"']+)["']\)/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content))) {
      if (isUsefulImportSpecifier(match[1])) {
        imports.add(match[1]);
      }
    }
  }

  return [...imports].sort();
}

function isUsefulImportSpecifier(specifier) {
  if (!specifier) return false;
  if (specifier.includes("${")) return false;
  if (specifier.startsWith("file:")) return false;
  return true;
}

function extractExports(content) {
  const exports = new Set();
  const patterns = [
    /\bexport\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g,
    /\bexport\s+(?:const|let|var|class)\s+([A-Za-z0-9_$]+)/g,
    /\bexport\s+default\s+([A-Za-z0-9_$]+)/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content))) {
      exports.add(match[1]);
    }
  }

  if (/\bexport\s+default\b/.test(content)) {
    exports.add("default");
  }

  return [...exports].sort();
}

function extractRoutes(relativePath, content) {
  const routes = [];
  const routePatterns = [
    /\b(?:app|router)\.(get|post|put|patch|delete)\(["'`]([^"'`]+)["'`]/g,
    /\b(?:GET|POST|PUT|PATCH|DELETE)\s*=/g
  ];

  let match;
  while ((match = routePatterns[0].exec(content))) {
    routes.push({ method: match[1].toUpperCase(), path: match[2] });
  }

  if (/(^|\/)(route|page)\.(js|jsx|ts|tsx)$/.test(relativePath)) {
    routes.push({ method: "FILE", path: inferRoutePath(relativePath) });
  }

  while ((match = routePatterns[1].exec(content))) {
    routes.push({ method: match[0].split("=")[0].trim(), path: inferRoutePath(relativePath) });
  }

  return dedupeObjects(routes);
}

function inferRoles(relativePath, content, routes) {
  const roles = new Set();
  const lower = relativePath.toLowerCase();
  const searchableContent = stripRegexLiterals(content);

  if (routes.length > 0) roles.add("route");
  if (/(^|\/)(page|layout)\.(js|jsx|ts|tsx)$/.test(lower)) roles.add("ui-entry");
  if (/(^|\/)(server|api|handler|controller|router)/.test(lower)) roles.add("backend");
  if (/(^|\/)(component|components|ui)\//.test(lower)) roles.add("ui");
  if (/(^|\/)(lib|utils|helpers|shared)\//.test(lower)) roles.add("shared");
  if (/(^|\/)(schema|model|models|db|database|prisma)\//.test(lower)) roles.add("data");
  if (/\bprocess\.env\b/.test(content)) roles.add("config-sensitive");
  if (/\bfetch\(|\baxios\.|\bhttp(s)?\.request\b/.test(content)) roles.add("network");
  if (/\b(openai|anthropic|bedrock|langchain|llamaindex|ai\/sdk)\b/i.test(searchableContent)) roles.add("ai-touchpoint");
  if (/\b(AWS|S3|Lambda|DynamoDB|CloudWatch|Bedrock)\b/.test(searchableContent)) roles.add("aws-touchpoint");

  return [...roles].sort();
}

function inferModule(relativePath) {
  const parts = relativePath.split("/");
  if (parts[0] === "apps" && parts.length > 1) return parts.slice(0, 2).join("/");
  if (parts[0] === "packages" && parts.length > 1) return parts.slice(0, 2).join("/");
  if (parts[0] === "src" && parts.length > 2) return parts.slice(0, 2).join("/");
  if (parts[0] === "src") return "src";
  return parts[0] ?? ".";
}

function stripRegexLiterals(content) {
  return content.replace(/\/(?:\\.|[^/\\\n])+\/[dgimsuy]*/g, "");
}

function inferRoutePath(relativePath) {
  return `/${relativePath
    .replace(/\.(js|jsx|ts|tsx)$/, "")
    .replace(/(^|\/)(app|pages|src\/app)\//, "")
    .replace(/\/(route|page|index)$/, "")
    .replace(/\[([^\]]+)\]/g, ":$1")}`;
}

function resolveImport(fromPath, specifier, byRelativePath, aliases) {
  if (!specifier.startsWith(".")) {
    const aliasTarget = resolveAlias(specifier, byRelativePath, aliases);
    return aliasTarget;
  }

  const base = normalizePath(path.join(path.dirname(fromPath), specifier));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`
  ];

  return candidates.find((candidate) => byRelativePath.has(candidate)) ?? null;
}

async function loadAliases(repoRoot) {
  const configs = ["tsconfig.json", "jsconfig.json"];

  for (const config of configs) {
    try {
      const content = await fs.readFile(path.join(repoRoot, config), "utf8");
      const parsed = JSON.parse(stripJsonComments(content));
      const compilerOptions = parsed.compilerOptions ?? {};
      const baseUrl = normalizePath(compilerOptions.baseUrl ?? ".");
      const paths = compilerOptions.paths ?? {};
      const aliases = [];

      for (const [pattern, targets] of Object.entries(paths)) {
        if (!Array.isArray(targets)) continue;
        for (const target of targets) {
          aliases.push({
            pattern,
            target: normalizePath(path.join(baseUrl, target))
          });
        }
      }

      if (aliases.length > 0) return aliases;
    } catch {
      // Config is optional. Invalid configs should not block a scan.
    }
  }

  return [];
}

function resolveAlias(specifier, byRelativePath, aliases) {
  for (const alias of aliases) {
    const starIndex = alias.pattern.indexOf("*");
    if (starIndex === -1 && specifier === alias.pattern) {
      return resolveCandidate(alias.target, byRelativePath);
    }

    if (starIndex === -1) continue;

    const prefix = alias.pattern.slice(0, starIndex);
    const suffix = alias.pattern.slice(starIndex + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;

    const matched = specifier.slice(prefix.length, specifier.length - suffix.length);
    const target = alias.target.replace("*", matched);
    const resolved = resolveCandidate(target, byRelativePath);
    if (resolved) return resolved;
  }

  return null;
}

function resolveCandidate(base, byRelativePath) {
  const normalized = normalizePath(base);
  const candidates = [
    normalized,
    `${normalized}.ts`,
    `${normalized}.tsx`,
    `${normalized}.js`,
    `${normalized}.jsx`,
    `${normalized}.mjs`,
    `${normalized}.cjs`,
    `${normalized}/index.ts`,
    `${normalized}/index.tsx`,
    `${normalized}/index.js`,
    `${normalized}/index.jsx`
  ];

  return candidates.find((candidate) => byRelativePath.has(candidate)) ?? null;
}

function stripJsonComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "");
}

function summarizeModules(records, edges) {
  const modules = new Map();

  for (const record of records) {
    const module = modules.get(record.module) ?? {
      name: record.module,
      files: 0,
      lines: 0,
      roles: {},
      incoming: 0,
      outgoing: 0
    };
    module.files += 1;
    module.lines += record.lines;
    for (const role of record.roles) {
      module.roles[role] = (module.roles[role] ?? 0) + 1;
    }
    modules.set(record.module, module);
  }

  for (const edge of edges.filter((edge) => edge.kind === "internal-import")) {
    const from = records.find((record) => record.path === edge.from)?.module;
    const to = records.find((record) => record.path === edge.to)?.module;
    if (!from || !to || from === to) continue;
    modules.get(from).outgoing += 1;
    modules.get(to).incoming += 1;
  }

  return [...modules.values()].sort((a, b) => b.files - a.files || a.name.localeCompare(b.name));
}

function rankHotspots(records, edges) {
  const incoming = new Map();
  const outgoing = new Map();

  for (const edge of edges) {
    outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1);
    if (edge.kind === "internal-import") {
      incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    }
  }

  return records
    .map((record) => {
      const inCount = incoming.get(record.path) ?? 0;
      const outCount = outgoing.get(record.path) ?? 0;
      const roleWeight = record.roles.length * 2;
      return {
        path: record.path,
        module: record.module,
        score: inCount * 3 + outCount + roleWeight,
        incoming: inCount,
        outgoing: outCount,
        roles: record.roles
      };
    })
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 25);
}

function dedupeObjects(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}
