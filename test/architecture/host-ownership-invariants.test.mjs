// Mechanical checks for the host-ownership invariants (nextgen ARCHITECTURE-AND-PLAN.md §2, C-2542), writer C5.
//
// I1  No checker Type / Signature / Symbol / CheckedSourceProgram (nor a record carrying one, e.g. Resolved*Info) is
//     reachable from any @tsonic/target-api entry a target may import (".", source, analysis, artifacts, provider; not
//     host): every exported type, every exported function's and method's parameters and result, inherited interface
//     members (Codex review K-2668), and the program a target receives (TargetCompileInput["source"]). Node and
//     SourceFile are site keys. Type-level: a generated tsgo probe over the BUILT .d.ts files
//     (host-ownership-probe/checker-free.ts).
// I2  tsonic-csharp/src imports no checker type, never imports @tsonic/target-api/host or a Host-internal module,
//     never asks a checker (semantics(...), effectiveTypes, getTypeAtLocation, resolveTypeWithState), and (Codex review
//     K-2662) no extension fact key it reads declares a payload that is or contains a checker type: the same tsgo probe
//     resolves each key's declared payload type through aliases.
// I3  Inside the Host (target-api, source-core, js-source-profile), only target-api/src/host-input/** imports checker
//     types.
// I5  No module-level mutable cache in Host production code (WeakMap / WeakSet, or a Map / Set the module mutates).
// I7  tsonic-csharp/src originates only CSHARP_ codes (plus the TSONIC_COMPILER_RESOURCE_LIMIT infrastructure code);
//     Host refusals are read once, in analysis/program/analyze.ts, and forwarded before any C# analysis.
// I6 is representation-boundaries.test.mjs; the C side of I4 (no fallback to a checker answer) is
// effective-type-boundaries.test.mjs; I4 totality is the Host owner test (target-api).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const laneRoot = path.resolve(packageRoot, "..");
const packagesRoot = path.join(laneRoot, "tsonic/packages");
const probeSource = path.join(packageRoot, "test/architecture/host-ownership-probe/checker-free.ts");
const tsgo = path.join(laneRoot, "tsonic/node_modules/.bin/tsgo");

function listTypeScript(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScript(full);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") && !entry.name.endsWith(".test.ts")
      ? [full] : [];
  });
}

const slash = value => value.split(path.sep).join("/");
const lineOf = (text, offset) => text.slice(0, offset).split("\n").length;

/** Removes comments and string/template contents, keeping offsets and line numbers. */
export function codeOnly(text) {
  let output = "";
  let index = 0;
  while (index < text.length) {
    const two = text.slice(index, index + 2);
    if (two === "//") {
      const end = text.indexOf("\n", index);
      const stop = end === -1 ? text.length : end;
      output += " ".repeat(stop - index);
      index = stop;
    } else if (two === "/*") {
      const end = text.indexOf("*/", index + 2);
      const stop = end === -1 ? text.length : end + 2;
      output += text.slice(index, stop).replace(/[^\n]/gu, " ");
      index = stop;
    } else if (text[index] === "\"" || text[index] === "'" || text[index] === "`") {
      const quote = text[index];
      let stop = index + 1;
      while (stop < text.length && text[stop] !== quote && (quote === "`" || text[stop] !== "\n")) stop += text[stop] === "\\" ? 2 : 1;
      output += quote + text.slice(index + 1, stop).replace(/[^\n]/gu, " ") + quote;
      index = stop + 1;
    } else {
      output += text[index];
      index += 1;
    }
  }
  return output;
}

/** Every import / re-export of a module specifier: { specifier, names, namespace, line }. */
export function moduleReferences(text) {
  const references = [];
  const pattern = /(?:import|export)\s+(?:type\s+)?(\{[\s\S]*?\}|\*\s+as\s+[A-Za-z_$][\w$]*|\*|[A-Za-z_$][\w$]*(?:\s*,\s*\{[\s\S]*?\})?)\s+from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/gu;
  for (const match of text.matchAll(pattern)) {
    const specifier = match[2] ?? match[3];
    const clause = match[1] ?? "";
    const braces = clause.match(/\{([\s\S]*)\}/u)?.[1] ?? "";
    const names = braces.split(",").map(part => part.trim().replace(/^type\s+/u, "").split(/\s+as\s+/u)[0].trim())
      .filter(name => name.length > 0);
    references.push({ specifier, names, namespace: /\*/u.test(clause) || match[3] !== undefined, line: lineOf(text, match.index) });
  }
  return references;
}

const checkerNames = /^(Type|Signature|Symbol|TypeChecker|Checker|TypeCheckerQueries|ObjectType|UnionType|IntersectionType|TypeReference|Resolved\w*Info|ResolvedCallEvidence|SourceFinalTypeQueries|SourceFileSemantics|SourceProgramSemantics)$/u;

function readSources(root) {
  return new Map(listTypeScript(root).map(file => [slash(path.relative(laneRoot, file)), fs.readFileSync(file, "utf8")]));
}

// ---------------------------------------------------------------------------------------------------------------
// I2 (whole tsonic-csharp/src)

const allowedSpecifiers = new Set([
  "@tsonic/tsts", "@tsonic/target-api", "@tsonic/target-api/analysis", "@tsonic/target-api/artifacts",
  "@tsonic/target-api/provider", "@tsonic/target-api/source", "@tsonic/source-core", "@tsonic/source-core/extension",
  "@tsonic/source-core/facts", "@tsonic/js-source-profile",
]);
const checkerAccess = /\b(?:source|program|host|input|policy|request|facts)\.(?:semantics|semanticsFor|hasSemantics|effectiveTypes)\b|\bsemantics(?:For)?\s*\(|\.types\.(?:resolve|authored|expression|effective)\w*\s*\(|\bgetTypeAtLocation\b|\bgetTypeChecker\b|\bresolveTypeWithState\b/gu;

export function i2Breaches(sources) {
  const breaches = [];
  for (const [file, text] of sources) {
    for (const reference of moduleReferences(text)) {
      if (reference.specifier.startsWith("@tsonic/") && !allowedSpecifiers.has(reference.specifier)) {
        breaches.push(`${file}:${reference.line} imports the non-public entry ${reference.specifier}`);
      }
      if (/(^|\/)tsonic\/packages\//u.test(reference.specifier)) breaches.push(`${file}:${reference.line} imports a Host module by path`);
      if (reference.specifier !== "@tsonic/tsts" && reference.specifier !== "@tsonic/target-api/source" &&
        reference.specifier !== "@tsonic/target-api/analysis") continue;
      if (reference.namespace) breaches.push(`${file}:${reference.line} namespace import of ${reference.specifier}`);
      for (const name of reference.names) {
        if (checkerNames.test(name)) breaches.push(`${file}:${reference.line} imports ${name} from ${reference.specifier}`);
      }
    }
    const code = codeOnly(text);
    for (const match of code.matchAll(checkerAccess)) breaches.push(`${file}:${lineOf(code, match.index)} checker access ${match[0].trim()}`);
  }
  return breaches;
}

test("I2: tsonic-csharp/src imports no checker type, no Host-internal entry and asks no checker", () => {
  const sources = readSources(path.join(packageRoot, "src"));
  assert.equal(sources.size > 100, true, "the C# sources are present");
  assert.deepEqual(i2Breaches(sources), []);
});

// ---------------------------------------------------------------------------------------------------------------
// I3, I5 (Host production code)

const hostRoots = ["target-api/src", "source-core/src", "js-source-profile/src"].map(root => path.join(packagesRoot, root));
const hostInput = "tsonic/packages/target-api/src/host-input/";

export function i3Breaches(sources) {
  const breaches = [];
  for (const [file, text] of sources) {
    if (file.startsWith(hostInput)) continue;
    for (const reference of moduleReferences(text)) {
      if (reference.specifier !== "@tsonic/tsts") continue;
      if (reference.namespace) breaches.push(`${file}:${reference.line} namespace import of @tsonic/tsts`);
      for (const name of reference.names) if (checkerNames.test(name)) breaches.push(`${file}:${reference.line} imports ${name}`);
    }
  }
  return breaches;
}

export function i5Breaches(sources) {
  const breaches = [];
  for (const [file, text] of sources) {
    const code = codeOnly(text);
    for (const match of code.matchAll(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*new\s+(WeakMap|WeakSet|Map|Set)\b/gmu)) {
      const [, name, kind] = match;
      const mutated = new RegExp(`\\b${name.replace(/\$/gu, "\\$")}\\s*\\.\\s*(?:set|add|delete|clear)\\s*\\(`, "u").test(code);
      if (kind.startsWith("Weak") || mutated) breaches.push(`${file}:${lineOf(code, match.index)} module-level ${kind} '${name}'`);
    }
  }
  return breaches;
}

test("I3: inside the Host only target-api/src/host-input/** imports checker types", () => {
  const sources = new Map(hostRoots.flatMap(root => [...readSources(root)]));
  assert.equal([...sources.keys()].some(file => file.startsWith(hostInput)), true, "the host-input adapter exists");
  assert.deepEqual(i3Breaches(sources), []);
});

test("I5: Host production code keeps no module-level mutable cache (lifetime is per program view)", () => {
  const sources = new Map(hostRoots.flatMap(root => [...readSources(root)]));
  assert.deepEqual(i5Breaches(sources), []);
});

// ---------------------------------------------------------------------------------------------------------------
// I7

// TSONIC_COMPILER_RESOURCE_LIMIT is infrastructure (R5); it is the only foreign code. The former TSONIC_CSHARP_<n> public
// code of the @tsonic/csharp/lang.js marker re-export refusal is CSHARP_LANG_MARKER_REEXPORT (Claude's ruling on R-C5-3: C#
// originates only CSHARP_ codes for .NET reasons; writer C7).
const allowedForeignCodes = /^TSONIC_COMPILER_RESOURCE_LIMIT$/u;

export function i7Breaches(sources) {
  const breaches = [];
  for (const [file, text] of sources) {
    for (const match of text.matchAll(/["'`]((?:TSONIC|TSTS)_[A-Z0-9_]*)/gu)) {
      if (!allowedForeignCodes.test(match[1])) breaches.push(`${file}:${lineOf(text, match.index)} originates ${match[1]}`);
    }
    for (const match of text.matchAll(/\bCSHARP_UNSUPPORTED_AST\b/gu)) breaches.push(`${file}:${lineOf(text, match.index)} CSHARP_UNSUPPORTED_AST`);
    const code = codeOnly(text);
    if (file !== "tsonic-csharp/src/analysis/program/analyze.ts") {
      for (const match of code.matchAll(/\.refusals\s*\(\s*\)|\bforwardSourceRefusal\s*\(/gu)) {
        if (file === "tsonic-csharp/src/analysis/program/source-facts.ts" && /^forwardSourceRefusal/u.test(match[0]) &&
          /export\s+function\s+$/u.test(code.slice(Math.max(0, match.index - 20), match.index))) continue;
        breaches.push(`${file}:${lineOf(code, match.index)} reads or forwards Host refusals outside the program entry`);
      }
    }
  }
  return breaches;
}

test("I7: C# originates only CSHARP_ codes and forwards Host refusals once, before C# analysis", () => {
  const sources = readSources(path.join(packageRoot, "src"));
  assert.deepEqual(i7Breaches(sources), []);
  const entry = codeOnly(sources.get("tsonic-csharp/src/analysis/program/analyze.ts"));
  const refusals = entry.indexOf("facts.refusals()");
  const forwarded = entry.indexOf("forwardSourceRefusal", refusals);
  const analysis = entry.indexOf("analyzeCsharpRepresentationIteration(");
  assert.equal(refusals !== -1 && forwarded !== -1 && analysis !== -1 && refusals < analysis && forwarded < analysis, true,
    "the program entry forwards facts.refusals() before the first C# analysis iteration");
});

// ---------------------------------------------------------------------------------------------------------------
// R5 caller census (K-2670)

// Host refusals are forwarded unchanged before C# analysis (analysis/program/analyze.ts). Inside C# analysis a refused
// Host fact is an invariant, read through the shared reader of analysis/program/source-facts.ts; no branch turns it into
// a new C# refusal, a code-less `unsupported` or a generic `rejected` result. The census names the consumers whose
// refused branch was switched to the shared reader (writer C7), and the one branch kept for a lazy Host fact that is not
// yet in facts.refusals(): the type-syntax refusal of a generic constraint part (request R-C7-6).
const r5SharedReaderConsumers = [
  "tsonic-csharp/src/representation/objects.ts",
  "tsonic-csharp/src/analysis/objects/shapes/api.ts",
];
const r5PendingLazyFacts = new Map([["tsonic-csharp/src/representation/generics.ts", "R-C7-6"]]);
const recodedHostRefusal = /\.kind\s*===\s*"refused"\s*\)?\s*(?:\?|return)\s*(?:csharpRefusal\s*\(|\{\s*kind:\s*"(?:unsupported|rejected)")/gu;

export function r5Breaches(sources) {
  const breaches = [];
  for (const [file, text] of sources) {
    if (r5PendingLazyFacts.has(file)) continue;
    for (const match of text.matchAll(recodedHostRefusal)) {
      breaches.push(`${file}:${lineOf(text, match.index)} turns a Host refusal into a C# result`);
    }
  }
  return breaches;
}

test("R5 (K-2670): a refused Host fact inside C# analysis is an invariant read through the shared reader", () => {
  const sources = readSources(path.join(packageRoot, "src"));
  assert.deepEqual(r5Breaches(sources), []);
  for (const file of r5SharedReaderConsumers) {
    const text = sources.get(file);
    assert.notEqual(text, undefined, `${file} exists`);
    assert.equal(moduleReferences(text).some(reference => /(^|\/)program\/source-facts\.js$/u.test(reference.specifier) &&
      reference.names.includes("sourceValueType")), true, `${file} imports the shared invariant reader`);
    assert.match(codeOnly(text), /\bsourceValueType\s*\(/u, `${file} reads refused values through the shared reader`);
  }
  for (const [file, request] of r5PendingLazyFacts) {
    assert.equal(sources.has(file), true, `${file} exists (pending ${request})`);
  }
  // Controls: each re-coding form is seen; the shared reader and a non-refusal branch are not.
  const controls = new Map([
    ["tsonic-csharp/src/a.ts", `if (outcome.kind === "refused") return csharpRefusal("CSHARP_X", "m", site);`],
    ["tsonic-csharp/src/b.ts", `if (outcome.kind === "refused") return { kind: "unsupported", reason: outcome.reason };`],
    ["tsonic-csharp/src/c.ts", `if (outcome.kind === "refused") return { kind: "rejected", subject: outcome.site, reason: "r" };`],
    ["tsonic-csharp/src/d.ts", `const type = sourceValueType(facts, node); if (x.kind === "resolved") return { kind: "rejected" };`],
  ]);
  assert.deepEqual(r5Breaches(controls).map(line => line.split(":")[0]),
    ["tsonic-csharp/src/a.ts", "tsonic-csharp/src/b.ts", "tsonic-csharp/src/c.ts"]);
});

// ---------------------------------------------------------------------------------------------------------------
// I1 + I2 fact payloads: the type-level probe (tsgo over the built .d.ts files)

// Every entry of the target-api package exports map except "./host" (the composition root's entry) and package.json.
function targetFacingEntries() {
  const manifest = JSON.parse(fs.readFileSync(path.join(packagesRoot, "target-api/package.json"), "utf8"));
  return Object.entries(manifest.exports).filter(([key]) => key !== "./host" && key !== "./package.json").map(([key, value]) => ({
    name: key === "." ? "" : key.slice(2),
    file: path.join(packagesRoot, "target-api", (typeof value === "string" ? value : value.types)),
  }));
}

/** Resolves a relative module specifier of a .d.ts file. */
function resolveDeclaration(from, specifier) {
  const base = path.resolve(path.dirname(from), specifier).replace(/\.js$/u, "");
  for (const candidate of [`${base}.d.ts`, path.join(base, "index.d.ts")]) if (fs.existsSync(candidate)) return candidate;
  return undefined;
}

function genericArity(text, offset) {
  if (text[offset] !== "<") return 0;
  let depth = 0;
  let count = 1;
  for (let index = offset; index < text.length; index += 1) {
    const character = text[index];
    if ("<([{".includes(character)) depth += 1;
    else if (">)]}".includes(character)) {
      if (text[index - 1] === "=" && character === ">") continue;
      depth -= 1;
      if (depth === 0) return count;
    } else if (character === "," && depth === 1) count += 1;
  }
  return count;
}

/** The kind ("type" | "value") and generic arity of `name` as exported by the .d.ts `file` (re-exports followed). */
function declarationOf(file, name, seen = new Set()) {
  const key = `${file}#${name}`;
  if (seen.has(key) || file === undefined) return undefined;
  seen.add(key);
  const text = fs.readFileSync(file, "utf8");
  const escaped = name.replace(/\$/gu, "\\$");
  const own = new RegExp(`export\\s+(?:declare\\s+)?(?:abstract\\s+)?(interface|type|class|function|const|let|var|enum|namespace)\\s+${escaped}\\b`, "u").exec(text);
  if (own !== null) {
    const kind = own[1] === "interface" || own[1] === "type" ? "type" : own[1] === "class" ? "class" : "value";
    return { kind, arity: genericArity(text, own.index + own[0].length) };
  }
  for (const match of text.matchAll(/export\s+(type\s+)?\{([^}]*)\}\s*(?:from\s*["']([^"']+)["'])?/gu)) {
    for (const part of match[2].split(",")) {
      const trimmed = part.trim().replace(/^type\s+/u, "");
      if (trimmed.length === 0) continue;
      const [local, exported = local] = trimmed.split(/\s+as\s+/u).map(value => value.trim());
      if (exported !== name) continue;
      const typeOnly = match[1] !== undefined || /^\s*type\s/u.test(part);
      const target = match[3] === undefined ? file : resolveDeclaration(file, match[3]);
      const resolved = match[3] === undefined ? localDeclaration(text, local) : declarationOf(target, local, seen);
      if (resolved === undefined) return undefined;
      return typeOnly && resolved.kind !== "type" ? { ...resolved, kind: resolved.kind === "class" ? "type" : "type-of-value" } : resolved;
    }
  }
  for (const match of text.matchAll(/export\s+\*\s+from\s*["']([^"']+)["']/gu)) {
    const resolved = declarationOf(resolveDeclaration(file, match[1]), name, seen);
    if (resolved !== undefined) return resolved;
  }
  return undefined;
}

function localDeclaration(text, name) {
  const match = new RegExp(`(?:declare\\s+)?(interface|type|class|function|const|let|var|enum)\\s+${name.replace(/\$/gu, "\\$")}\\b`, "u").exec(text);
  if (match === null) return undefined;
  return { kind: match[1] === "interface" || match[1] === "type" ? "type" : match[1] === "class" ? "class" : "value",
    arity: genericArity(text, match.index + match[0].length) };
}

/** Every name an entry .d.ts exports (export lists, declarations and export * chains). */
function exportedNames(file, seen = new Set()) {
  if (file === undefined || seen.has(file)) return [];
  seen.add(file);
  const text = fs.readFileSync(file, "utf8");
  const names = new Set();
  for (const match of text.matchAll(/export\s+(?:declare\s+)?(?:abstract\s+)?(?:interface|type|class|function|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/gu)) names.add(match[1]);
  for (const match of text.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/gu)) {
    for (const part of match[1].split(",")) {
      const trimmed = part.trim().replace(/^type\s+/u, "");
      if (trimmed.length > 0) names.add((trimmed.split(/\s+as\s+/u)[1] ?? trimmed).trim());
    }
  }
  for (const match of text.matchAll(/export\s+\*\s+from\s*["']([^"']+)["']/gu)) {
    for (const name of exportedNames(resolveDeclaration(file, match[1]), seen)) names.add(name);
  }
  return [...names].sort();
}

/** The fact keys tsonic-csharp/src reads: { name, specifier } (bare package entry, or the built .d.ts of a C# module). */
export function csharpFactKeys(sources) {
  const keys = new Map();
  for (const [file, text] of sources) {
    for (const reference of moduleReferences(text)) {
      for (const name of reference.names) {
        if (!/FactKey$/u.test(name) || /^(ExtensionFactKey|defineExtensionFactKey)$/u.test(name)) continue;
        const specifier = reference.specifier.startsWith(".")
          ? path.resolve(laneRoot, path.dirname(file), reference.specifier) : reference.specifier;
        keys.set(name, specifier);
      }
    }
    for (const match of codeOnly(text).matchAll(/export\s+const\s+([A-Za-z_$][\w$]*FactKey)\s*=/gu)) {
      keys.set(match[1], path.resolve(laneRoot, file).replace(/\.ts$/u, ".js"));
    }
  }
  return [...keys].map(([name, specifier]) => ({ name, specifier })).sort((left, right) => left.name.localeCompare(right.name));
}

/** The built-.d.ts module a C# src module specifier denotes (src/x.js -> dist/x.js, whose .d.ts sits beside it). */
function builtSpecifier(specifier) {
  if (!path.isAbsolute(specifier)) return specifier;
  const relative = slash(path.relative(path.join(packageRoot, "src"), specifier)).replace(/\.ts$/u, ".js");
  return slash(path.join(packageRoot, "dist", relative));
}

function probeProject(directory, rows, controls) {
  const tsconfig = {
    compilerOptions: {
      strict: true, noEmit: true, skipLibCheck: true, target: "es2022", lib: ["es2022"], types: [],
      module: "esnext", moduleResolution: "bundler",
      paths: {
        "@tsonic/tsts": [path.join(packagesRoot, "tsts/dist/src/index.d.ts")],
        "@tsonic/target-api": [path.join(packagesRoot, "target-api/dist/public/index.d.ts")],
        "@tsonic/target-api/*": [path.join(packagesRoot, "target-api/dist/public/*.d.ts")],
        "@tsonic/source-core": [path.join(packagesRoot, "source-core/dist/public/index.d.ts")],
        "@tsonic/source-core/*": [path.join(packagesRoot, "source-core/dist/public/*.d.ts")],
        "@tsonic/js-source-profile": [path.join(packagesRoot, "js-source-profile/dist/index.d.ts")],
      },
    },
    files: ["checker-free.ts", "probe.ts", "controls.ts"],
  };
  fs.mkdirSync(directory, { recursive: true });
  fs.copyFileSync(probeSource, path.join(directory, "checker-free.ts"));
  fs.writeFileSync(path.join(directory, "tsconfig.json"), JSON.stringify(tsconfig, null, 2));
  fs.writeFileSync(path.join(directory, "probe.ts"), rows.text);
  fs.writeFileSync(path.join(directory, "controls.ts"), controls.text);
}

/** The probe text: one Check row per subject; `labels` maps each row's line to its subject. */
export function generateProbe(entries, factKeys) {
  const lines = [`import type { Check, FactPayload, NoChecker, Resolved } from "./checker-free.js";`];
  const labels = new Map();
  const unresolved = [];
  const row = (label, text) => { lines.push(text); labels.set(lines.length, label); };
  for (const [index, entry] of entries.entries()) {
    const specifier = entry.name === "" ? "@tsonic/target-api" : `@tsonic/target-api/${entry.name}`;
    lines.push(`import type * as Entry${index} from "${specifier}";`);
    for (const name of entry.names) {
      const declaration = declarationOf(entry.file, name);
      if (declaration === undefined) { unresolved.push(`${entry.name}:${name}`); continue; }
      const args = declaration.arity === 0 ? "" : `<${Array(declaration.arity).fill("any").join(", ")}>`;
      const subject = declaration.kind === "type" ? `Entry${index}.${name}${args}`
        : declaration.kind === "class" ? `Entry${index}.${name}${args}`
          : `typeof Entry${index}.${name}`;
      if (declaration.kind === "type-of-value") { unresolved.push(`${entry.name}:${name} (type-only export of a value)`); continue; }
      row(`I1 ${specifier} ${name}`, `export type I1_${index}_${name} = Check<NoChecker<${subject}>>;`);
    }
  }
  lines.push(`import type { TargetCompileInput } from "@tsonic/target-api";`);
  row("I1 TargetCompileInput[\"source\"]", `export type I1_compile_input_source = Check<NoChecker<TargetCompileInput["source"]>>;`);
  for (const [index, key] of factKeys.entries()) {
    lines.push(`import type { ${key.name} as Key${index} } from ${JSON.stringify(builtSpecifier(key.specifier))};`);
    row(`I2 fact key ${key.name} payload resolved`, `export type I2_resolved_${key.name} = Check<Resolved<FactPayload<typeof Key${index}>>>;`);
    row(`I2 fact key ${key.name} payload checker-free`, `export type I2_payload_${key.name} = Check<NoChecker<FactPayload<typeof Key${index}>>>;`);
  }
  return { text: `${lines.join("\n")}\n`, labels, unresolved };
}

/** Planted controls: rows tagged "breach" must fail to compile, rows tagged "clean" must compile. */
export function generateControls() {
  const lines = [
    `import type { Node, Signature, SourceFile, Type } from "@tsonic/tsts";`,
    `import type { CheckedSourceProgram } from "@tsonic/tsts";`,
    `import type { Check, FactPayload, NoChecker } from "./checker-free.js";`,
    `interface Base { readonly hidden: (program: CheckedSourceProgram) => void }`,
    `interface Derived extends Base { readonly name: string }`,
    `type Descriptor = { readonly kind: "array"; readonly element: Descriptor } | { readonly kind: "primitive"; readonly name: string };`,
    `declare const plantedKey: { readonly snapshot: (value: { readonly site: Node; readonly cached: { readonly type: Type } }) => unknown };`,
    `declare const cleanKey: { readonly snapshot: (value: { readonly site: Node; readonly file: SourceFile; readonly name: string }) => unknown };`,
    `type AliasedPayload = { readonly members: ReadonlyMap<string, readonly Type[]> };`,
    `interface Facts { readonly values: { type(node: Node): Descriptor; signature(node: Node): Signature | undefined } }`,
  ];
  const expected = new Map();
  const row = (verdict, text) => { lines.push(text); expected.set(lines.length, verdict); };
  row("breach", `export type C1 = Check<NoChecker<FactPayload<typeof plantedKey>>>;`);
  row("breach", `export type C2 = Check<NoChecker<AliasedPayload>>;`);
  row("breach", `export type C3 = Check<NoChecker<Facts>>;`);
  row("breach", `export type C4 = Check<NoChecker<(site: Node) => Type>>;`);
  row("breach", `export type C4b = Check<NoChecker<Derived>>;`);
  row("breach", `export type C4c = Check<NoChecker<{ read(node: Node, signature: Signature): string }>>;`);
  row("clean", `export type C5 = Check<NoChecker<FactPayload<typeof cleanKey>>>;`);
  row("clean", `export type C6 = Check<NoChecker<{ readonly type(node: Node): Descriptor; readonly sites: readonly Node[] }>>;`);
  row("clean", `export type C7 = Check<NoChecker<ReadonlyMap<Node, Descriptor>>>;`);
  return { text: `${lines.join("\n")}\n`, expected };
}

/** Line numbers of tsgo errors per file name. */
export function errorLines(output) {
  const lines = new Map();
  for (const match of output.matchAll(/([\w.-]+\.ts)[(:](\d+)[,:]\d+\)?:?\s*-?\s*error\b/gu)) {
    const file = match[1];
    if (!lines.has(file)) lines.set(file, new Set());
    lines.get(file).add(Number(match[2]));
  }
  return lines;
}

test("I1 / I2 (K-2662): no checker type reaches the target-facing entries or any fact payload C# reads (tsgo probe)",
  { timeout: 600_000 }, () => {
    assert.equal(fs.existsSync(tsgo), true, `the TS-Go compiler is installed at ${tsgo}`);
    const entries = targetFacingEntries().map(entry => {
      assert.equal(fs.existsSync(entry.file), true, `the built entry ${entry.file} exists (run the build first)`);
      return { ...entry, names: exportedNames(entry.file) };
    });
    assert.deepEqual(entries.map(entry => entry.name).sort(), ["", "analysis", "artifacts", "provider", "source"],
      "every target-importable entry is probed; ./host is not");
    const source = entries.find(entry => entry.name === "source");
    assert.equal(source.names.includes("SourceProgramFacts") && source.names.includes("TargetSourceProgramFacts"), true,
      "the source entry exports the fact contract");
    const factKeys = csharpFactKeys(readSources(path.join(packageRoot, "src")));
    assert.equal(factKeys.some(key => key.name === "providerVirtualDeclarationFactKey"), true, "the fact-key scan sees C# reads");
    const probe = generateProbe(entries, factKeys);
    assert.deepEqual(probe.unresolved, [], "every exported name resolves to a declaration in the built .d.ts files");
    const controls = generateControls();
    fs.mkdirSync(path.join(packageRoot, ".temp"), { recursive: true });
    const directory = fs.mkdtempSync(path.join(packageRoot, ".temp", "host-ownership-probe-"));
    try {
      probeProject(directory, probe, controls);
      const run = spawnSync(tsgo, ["--noEmit", "--pretty", "false", "-p", path.join(directory, "tsconfig.json")],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
      const errors = errorLines(output);
      assert.equal(run.status === 0 || errors.size > 0, true, `tsgo failed without located diagnostics:\n${output.slice(0, 4000)}`);
      assert.equal(errors.has("controls.ts"), true, "the planted breaches are reported, so the probe was type-checked");
      const otherFiles = [...errors.keys()].filter(file => file !== "probe.ts" && file !== "controls.ts");
      assert.deepEqual(otherFiles, [], `the probe compiles against the built declarations:\n${output.slice(0, 4000)}`);
      const controlErrors = errors.get("controls.ts") ?? new Set();
      for (const [line, verdict] of controls.expected) {
        assert.equal(controlErrors.has(line), verdict === "breach", `control line ${line} (${verdict}):\n${output.slice(0, 2000)}`);
      }
      const probeErrors = [...(errors.get("probe.ts") ?? [])].sort((left, right) => left - right);
      const unlabeled = probeErrors.filter(line => !probe.labels.has(line));
      assert.deepEqual(unlabeled, [], `probe import or syntax errors:\n${output.slice(0, 4000)}`);
      assert.deepEqual(probeErrors.map(line => probe.labels.get(line)), [], "subjects that contain a checker type");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

// ---------------------------------------------------------------------------------------------------------------
// Negative controls for the text scans

test("negative controls: every text scan sees a planted breach and passes its clean twin", () => {
  const csharp = new Map([
    ["tsonic-csharp/src/a.ts", `import type { Node, Type } from "@tsonic/tsts";\nexport const a = 1;`],
    ["tsonic-csharp/src/b.ts", `import { createHostSourceProgram } from "@tsonic/target-api/host";`],
    ["tsonic-csharp/src/c.ts", `export function f(host) { return host.semanticsFor(node).types.expressionType(node); }`],
    ["tsonic-csharp/src/d.ts", `export function g(source) { return source.effectiveTypes.get(node); }`],
  ]);
  assert.equal(i2Breaches(csharp).length >= 4, true, i2Breaches(csharp).join("\n"));
  assert.deepEqual(i2Breaches(new Map([["tsonic-csharp/src/e.ts",
    `import type { Node } from "@tsonic/tsts";\n// semanticsFor(node) is gone\nconst effectiveTypes = new WeakMap();\nconst s = sequence.semantics;`]])), [],
  "comments, a local named effectiveTypes and a record field named semantics are not checker access");
  const host = new Map([
    ["tsonic/packages/target-api/src/source-semantics/x.ts", `import type { Type } from "@tsonic/tsts";`],
    ["tsonic/packages/target-api/src/host-input/y.ts", `import type { Type } from "@tsonic/tsts";`],
  ]);
  assert.deepEqual(i3Breaches(host).map(line => line.split(":")[0]), ["tsonic/packages/target-api/src/source-semantics/x.ts"]);
  const caches = new Map([["tsonic/packages/target-api/src/z.ts",
    `const cache = new WeakMap();\nconst seen = new Map();\nexport function f(k) { seen.set(k, 1); }\nconst table = new Set(["a", "b"]);\nexport const has = v => table.has(v);`]]);
  assert.deepEqual(i5Breaches(caches).map(line => line.split(" ").at(-1)), ["'cache'", "'seen'"]);
  const codes = new Map([
    ["tsonic-csharp/src/a.ts", `refuse(node, "TSONIC_ANY_UNSUPPORTED", message);`],
    ["tsonic-csharp/src/b.ts", `return { code: "CSHARP_UNSUPPORTED_AST" };`],
    ["tsonic-csharp/src/c.ts", `const refusals = program.facts.refusals();`],
    ["tsonic-csharp/src/d.ts", `issues.push({ code: "TSONIC_COMPILER_RESOURCE_LIMIT" }); refuse("CSHARP_LITERAL_NOT_REPRESENTABLE");`],
    ["tsonic-csharp/src/e.ts", "const publicCode = `TSONIC_CSHARP_${numericCode}`;"],
  ]);
  assert.deepEqual(i7Breaches(codes).map(line => line.split(":")[0]),
    ["tsonic-csharp/src/a.ts", "tsonic-csharp/src/b.ts", "tsonic-csharp/src/c.ts", "tsonic-csharp/src/e.ts"]);
  const keys = csharpFactKeys(new Map([["tsonic-csharp/src/source/x.ts",
    `import { providerVirtualDeclarationFactKey, defineExtensionFactKey, type ExtensionFactKey } from "@tsonic/tsts";\nexport const localFactKey = defineExtensionFactKey({});`]]));
  assert.deepEqual(keys.map(key => key.name), ["localFactKey", "providerVirtualDeclarationFactKey"]);
  assert.deepEqual(errorLines("probe.ts(12,5): error TS2344: Type 'false' does not satisfy the constraint 'true'.\n").get("probe.ts"), new Set([12]));
});
