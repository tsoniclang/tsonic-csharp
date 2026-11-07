// Mechanical checks for invariant I6 and the C# side of I2 (nextgen ARCHITECTURE-AND-PLAN.md §2, C-2542).
//
// I6: one descriptor -> TargetTypeRef mapping (src/representation/descriptors.ts, entered through
//     src/representation/index.ts); no second Source type engine; no sort or dedupe of union arms in tsonic-csharp/src
//     (R6: the Host publishes the arms authored-first, C-2459; C# keeps them positional).
// I2 (C side): representation/**, policy/conversions/**, policy/types/** and target-model/types/** import no checker
//     Type / Signature / Symbol / Resolved*Info from @tsonic/tsts, never import the Host-internal entry
//     @tsonic/target-api/host, and never ask a checker (semantics(...).types, resolveTypeWithState).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = path.join(packageRoot, "src");

function listTypeScript(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScript(full);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}

const relative = file => path.relative(packageRoot, file).split(path.sep).join("/");
const sources = new Map(listTypeScript(sourceRoot).map(file => [relative(file), fs.readFileSync(file, "utf8")]));

/** Removes comments and string/template contents, keeping offsets and line numbers. */
function codeOnly(text) {
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
      // A quote or double-quote string ends at its line; a template may span lines.
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

const lineOf = (text, offset) => text.slice(0, offset).split("\n").length;

/** Every import / re-export of a module specifier: { specifier, names, namespace, line }. */
function moduleReferences(text) {
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

const descriptorKindLabels = ["primitive", "string", "intrinsic", "union", "array", "tuple", "shape", "callable", "declared", "optional"];

test("I6: exactly one module maps Source descriptors to .NET types, and it is src/representation/descriptors.ts", () => {
  const mappers = [];
  for (const [file, text] of sources) {
    const labels = descriptorKindLabels.filter(kind => new RegExp(`case\\s+"${kind}"\\s*:`, "u").test(text));
    // A switch over at least six descriptor kinds is a descriptor -> carrier mapping.
    if (labels.length >= 6) mappers.push(file);
  }
  assert.deepEqual(mappers, ["src/representation/descriptors.ts"],
    "a second switch over SourceTypeDescriptor kinds is a second descriptor -> TargetTypeRef mapping (I6)");
  const definitions = [...sources].filter(([, text]) => /export\s+function\s+representSourceType\s*\(/u.test(text)).map(([file]) => file);
  assert.deepEqual(definitions, ["src/representation/descriptors.ts"]);
});

test("I6: code outside src/representation enters the mapping only through representation/index.js", () => {
  const breaches = [];
  for (const [file, text] of sources) {
    if (file.startsWith("src/representation/")) continue;
    for (const reference of moduleReferences(text)) {
      if (/(^|\/)representation\/(?!index\.js$)[^/]+\.js$/u.test(reference.specifier)) {
        breaches.push(`${file}:${reference.line} ${reference.specifier}`);
      }
    }
  }
  assert.deepEqual(breaches, []);
});

test("I6: the replaced Source type engines stay deleted", () => {
  const deleted = [
    "src/analysis/source-evidence/types/resolution",
    "src/policy/types/source-type-flow/representation.ts",
    "src/policy/types/resolution/selected-type-evidence.ts",
    "src/policy/conversions/common-target.ts",
    "src/analysis/conversions/common-target.ts",
  ];
  assert.deepEqual(deleted.filter(entry => fs.existsSync(path.join(packageRoot, entry))), []);
  const engineNames = /\b(resolveTypeWithState|combineCsharpTargetUnionMembers|representCsharpSourceType|reconcileCsharpSelectedTargetType|csharpSourceUnionReturnLayout|csharpNumericReturnBaselineCovered|csharpSourceUnionLayoutsMatch|compareCsharpImplicitConversionTargets)\b/gu;
  const uses = [];
  for (const [file, text] of sources) {
    const code = codeOnly(text);
    for (const match of code.matchAll(engineNames)) uses.push(`${file}:${lineOf(code, match.index)} ${match[0]}`);
  }
  assert.deepEqual(uses, []);
});

test("I6: C# builds no Source union or type-application descriptor outside src/representation (R-R4-57)", () => {
  // The one union builder and the one substitution are the Host's (sums.join / sums.substitute; I6). A C# object
  // literal `{ kind: "union", types }` or `{ kind: "declared", declaration, ... }` outside the representation layer
  // builds a second union or applies a declaration itself. src/providers/** builds its own provider type expressions
  // (a different model), so it is not scanned.
  const construction = /\bkind\s*:\s*"(union|declared)"(\s+as\s+const)?\s*,\s*(types|declaration)\b/u;
  const breaches = [];
  for (const [file, text] of sources) {
    if (file.startsWith("src/representation/") || file.startsWith("src/providers/")) continue;
    text.split("\n").forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
      if (construction.test(line)) breaches.push(`${file}:${index + 1} builds a ${construction.exec(line)[1]} descriptor`);
    });
  }
  assert.deepEqual(breaches, []);
});

test("I6 / R6: tsonic-csharp/src never sorts or dedupes union arms (Host order is authored-first, C-2459)", () => {
  const breaches = [];
  const unionWords = /\b(arms?|union|unions|members?Of|sum)\b|Arms?\b|Union/u;
  // A positional reorder by Host arm index restores published order; it is the only comparator allowed on arms.
  const positional = /^\s*\(?\s*(\w+)\s*,\s*(\w+)\s*\)?\s*=>\s*\1\.(armIndex|index|role)\s*-\s*\2\.\3\s*\)?\s*$/u;
  for (const [file, text] of sources) {
    const code = codeOnly(text);
    const lines = code.split("\n");
    for (const match of code.matchAll(/\.(sort|toSorted)\s*\(/gu)) {
      const line = lineOf(code, match.index);
      const statement = lines.slice(Math.max(0, line - 2), line + 2).join(" ");
      if (!unionWords.test(statement)) continue;
      const comparatorStart = match.index + match[0].length;
      let depth = 1;
      let stop = comparatorStart;
      while (stop < code.length && depth > 0) {
        if (code[stop] === "(") depth += 1;
        else if (code[stop] === ")") depth -= 1;
        stop += 1;
      }
      const comparator = code.slice(comparatorStart, stop - 1).replace(/\s+/gu, " ");
      if (!positional.test(comparator)) breaches.push(`${file}:${line} sorts union arms by ${comparator.trim() || "default order"}`);
    }
    for (const match of code.matchAll(/(\[\s*\.\.\.\s*new\s+(Set|Map)\s*\(|Array\.from\s*\(\s*new\s+(Set|Map)\s*\(|\.filter\s*\([^)]*\b(indexOf|findIndex|lastIndexOf)\b)/gu)) {
      const line = lineOf(code, match.index);
      if (/\barms?\b|Arms?\b|[Uu]nion/u.test(lines[line - 1] ?? "")) breaches.push(`${file}:${line} dedupes union arms`);
    }
  }
  assert.deepEqual(breaches, []);
});

const checkerFreeRoots = ["src/representation/", "src/policy/conversions/", "src/policy/types/", "src/target-model/types/"];
const checkerNames = /^(Type|Signature|Symbol|TypeChecker|Checker|ObjectType|UnionType|IntersectionType|TypeReference|Resolved\w*Info|SourceFinalTypeQueries|SourceFileSemantics|SourceProgramSemantics)$/u;

test("I2 (C side): representation, conversions, policy types and target-model types import no checker types", () => {
  assert.equal([...sources.keys()].some(file => file.startsWith("src/representation/")), true, "the representation layer exists");
  const breaches = [];
  for (const [file, text] of sources) {
    if (!checkerFreeRoots.some(root => file.startsWith(root))) continue;
    for (const reference of moduleReferences(text)) {
      if (reference.specifier === "@tsonic/target-api/host" || reference.specifier.startsWith("@tsonic/target-api/host/")) {
        breaches.push(`${file}:${reference.line} imports the Host-internal entry ${reference.specifier}`);
      }
      if (!reference.specifier.startsWith("@tsonic/tsts")) continue;
      if (reference.namespace) breaches.push(`${file}:${reference.line} namespace import of ${reference.specifier}`);
      for (const name of reference.names) {
        if (checkerNames.test(name)) breaches.push(`${file}:${reference.line} imports ${name} from ${reference.specifier}`);
      }
    }
    const code = codeOnly(text);
    for (const match of code.matchAll(/\bsemantics(For)?\s*\(|\.semantics\b|\.types\.(resolve|authored|expression|effective)\w*\s*\(|\bgetTypeAtLocation\b|\bresolveTypeWithState\b|\beffectiveTypes\b/gu)) {
      breaches.push(`${file}:${lineOf(code, match.index)} checker access ${match[0].trim()}`);
    }
  }
  assert.deepEqual(breaches, []);
});

test("negative controls: the scans see a planted second mapping, an arm sort, an arm dedupe and a checker import", () => {
  const second = `switch (descriptor.kind) { case "primitive": case "string": case "intrinsic": case "union": case "array": case "tuple": }`;
  assert.equal(descriptorKindLabels.filter(kind => new RegExp(`case\\s+"${kind}"\\s*:`, "u").test(second)).length >= 6, true);
  const sorted = codeOnly(`const arms = [...union.arms].sort((left, right) => targetTypeRefKey(left).localeCompare(targetTypeRefKey(right)));`);
  assert.equal(/\.(sort|toSorted)\s*\(/u.test(sorted) && /Arms?\b|\barms?\b|[Uu]nion/u.test(sorted), true);
  const positional = /^\s*\(?\s*(\w+)\s*,\s*(\w+)\s*\)?\s*=>\s*\1\.(armIndex|index|role)\s*-\s*\2\.\3\s*\)?\s*$/u;
  assert.equal(positional.test("(left, right) => left.armIndex - right.armIndex"), true);
  assert.equal(positional.test("(left, right) => targetTypeRefKey(left).localeCompare(targetTypeRefKey(right))"), false);
  assert.equal(/(\[\s*\.\.\.\s*new\s+(Set|Map)\s*\()/u.test(codeOnly("const arms = [...new Set(unionArms)];")), true);
  const imported = moduleReferences(`import type {\n  Node,\n  Type,\n} from "@tsonic/tsts";`);
  assert.deepEqual(imported.map(reference => reference.names), [["Node", "Type"]]);
  assert.equal(imported[0].names.some(name => checkerNames.test(name)), true);
  assert.equal(codeOnly(`// resolveTypeWithState\nconst x = "resolveTypeWithState";`).includes("resolveTypeWithState"), false,
    "comments and strings do not count as uses");
});
