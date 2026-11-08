import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import * as boundary from "./effective-type-boundaries.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const findings = text => boundary.sourceEvidenceBoundaryFindings(new Map([["src/analysis/example.ts", text]]));

test("Native Source representation consumes published evidence without any checker resolver or fallback channel", () => {
  const sources = new Map(filesUnder(join(root, "src")).map(file => [relative(root, file), readFileSync(file, "utf8")]));
  const host = join(dirname(root), "tsonic/packages/target-api/src/source-semantics/local-type-flow");
  for (const file of filesUnder(host)) sources.set(`host/source-semantics/local-type-flow/${relative(host, file)}`, readFileSync(file, "utf8"));
  assert.deepEqual(boundary.sourceEvidenceBoundaryFindings(sources), []);
});

test("the superseded allowance and partial-publication APIs are not exported", () => {
  assert.equal(Object.hasOwn(boundary, "declarationConverterAllowances"), false);
  assert.equal(Object.hasOwn(boundary, "effectiveTypeBoundaryFindings"), false);
});

test("Native representation policy inputs own their data below analysis implementations", () => {
  const model = readFileSync(join(root, "src/policy/model/type-resolution.ts"), "utf8");
  assert.doesNotMatch(model, /(?:from\s*["']|import\s*\(["'])[^"']*analysis\//u);
  assert.doesNotMatch(model, /ReturnType\s*<\s*typeof\s+import/u);
  for (const name of ["CsharpSourceRepresentationQueries", "CsharpRepresentedApplication", "CsharpRepresentedArgument",
    "CsharpRepresentedDeclaredSlot", "CsharpRepresentedMemberUse", "CsharpRepresentedMemberUseArm"]) {
    assert.match(model, new RegExp(`export interface ${name}\\b`, "u"), name);
  }
  for (const path of ["representations.ts", "member-use.ts"]) {
    const producer = readFileSync(join(root, "src/analysis/source-evidence", path), "utf8");
    assert.match(producer, /from ["']\.\.\/\.\.\/policy\/model\/type-resolution\.js["']/u, path);
    assert.doesNotMatch(producer, /export\s+(?:interface\s+Csharp(?:SourceRepresentationQueries|Represented)|type\s*\{)/u, path);
  }
});

for (const [label, text] of [
  ["direct checker type", 'import type { Type } from "@tsonic/tsts";'],
  ["aliased checker type", 'import type { Type as Input } from "@tsonic/tsts"; type Cached = Map<Input, TargetTypeRef>;'],
  ["nested Type keyed map", 'import type { Type } from "@tsonic/tsts"; type Cached = Map<Node, WeakMap<Type, TargetTypeRef>>;'],
  ["map alias", 'import type { Type } from "@tsonic/tsts"; const cache = new Map<Type, TargetTypeRef>(); const other = cache;'],
  ["property map", 'import type { Type } from "@tsonic/tsts"; class Store { values = new Map<Type, TargetTypeRef>(); }'],
  ["annotated map", 'import type { Type } from "@tsonic/tsts"; const values: Map<Type, TargetTypeRef> = new Map(); values.get(selected);'],
  ["renamed native carrier", 'import type { Type } from "@tsonic/tsts"; import type { TargetTypeRef as Carrier } from "./native-types.js"; const values = new Map<Type, Carrier>(); values.get(selected);'],
  ["annotated profile channel", 'import type { Type } from "@tsonic/tsts"; interface Inputs { types: Map<Type, TargetTypeRef>; }'],
  ["published profile channel", 'import type { Type } from "@tsonic/tsts"; interface Inputs { types: Map<Type, TargetTypeRef>; } function read(operation: { inputs: Inputs; sourceResultType: Type }) { return operation.inputs.types.get(operation.sourceResultType); }'],
  ["checked program", 'import type { CheckedSourceProgram as Input } from "@tsonic/tsts";'],
  ["signature", 'import type { Signature } from "@tsonic/tsts";'],
  ["symbol", 'import type { Symbol } from "@tsonic/tsts";'],
  ["checker vocabulary record", 'import type { ResolvedSourceCallInfo } from "@tsonic/tsts";'],
  ["namespace", 'import * as Checked from "@tsonic/tsts";'],
  ["inline import type", 'type Cached = import("@tsonic/tsts").Type;'],
  ["transitive reexport", 'export type { Type as Input } from "@tsonic/tsts";'],
]) {
  test(`Source boundary rejects ${label} without a private resolver exemption`, () => {
    assert.equal(findings(text).some(row => row.rule.startsWith("checker-")), true, label);
  });
}

for (const query of ["expressionType", "declaredValueType", "typeOfSymbol", "declaredSymbolType", "writeSymbolType", "getTypeAtLocation", "getResolvedCallInfo", "selectValueTypeRefinement"]) {
  test(`Source boundary rejects raw ${query} queries`, () => {
    assert.equal(findings(`const first = queries.${query}(node); const selected = first; represent(selected);`)
      .some(row => row.rule === "native-checker-query"), true);
  });
}

for (const [label, text] of [
  ["direct conversion", "types.resolveType(source.sourceReadType);"],
  ["converter alias", "const convert = types.resolveType; convert(value);"],
  ["helper forwarding", "function convert(type) { return host.types.resolveType(type); }"],
  ["private declaration cache", "const cache = new Map(); const convert = objectShapes.resolveType;"],
]) {
  test(`Source boundary rejects retired ${label}`, () => {
    assert.equal(findings(text).some(row => row.rule === "raw-type-resolver-reference"), true);
  });
}

test("same-occurrence, foreign-occurrence and conditional gates cannot rescue a checked-Type retry", () => {
  for (const text of [
    "if (host.effectiveTypes.get(node) !== undefined) return selected; return types.resolveType(type);",
    "if (host.effectiveTypes.get(other) !== undefined) return selected; return types.resolveType(type);",
    "return effective === undefined ? types.resolveType(type) : selected;",
    "if (facts.values.type(node).kind === 'refused') return queries.getTypeAtLocation(node);",
  ]) assert.equal(findings(text).some(row => ["retired-source-query-channel", "raw-type-resolver-reference", "native-checker-query"].includes(row.rule)), true);
});

test("effective-type architecture rejects selected parameter vector", () => {
  assert.equal(findings("deriveMembers(source.sourceSelectedSignatureParameters);")
    .some(row => row.rule === "retired-source-query-channel"), true);
});

test("parentheses and assertion expressions cannot hide checker queries", () => {
  for (const callee of ["(queries.getTypeAtLocation)", "(queries.getTypeAtLocation as Resolver)",
    "queries.getTypeAtLocation!", "(queries.getTypeAtLocation satisfies Resolver)"]) {
    assert.equal(findings(`${callee}(node);`).some(row => row.rule === "native-checker-query"), true);
  }
});

test("published descriptors, original sites, Native ABI metadata and exact provider identity are not checker answers", () => {
  assert.deepEqual(findings(`
    import type { SourceTypeEvidence, SourceSignatureIdentity } from "@tsonic/target-api/source";
    import type { Node, SourceFile, AstReader, ProviderTypeExpression } from "@tsonic/tsts";
    const values = new Map<Node, TargetTypeRef>();
    function deriveMembers(evidence: SourceTypeEvidence, site: Node) { return view.represent(evidence, "value", site); }
    const declared = facts.values.declaredSlot(parameter);
    const selected = facts.applications.application(call);
    const physical = relationCatalog.resolveType(identity);
    const pointee = nativePointer.pointee;
    const layout = nativeMember.returnType;
    const text = "types.resolveType(raw)";
  `), []);
});

for (const specifier of ["../../target-analysis/source-storage/index.js", "tsonic-csharp/target-model/types.js", "tsonic-rust/policy.js"]) {
  test(`Host type flow cannot import ${specifier}`, () => {
    const rows = boundary.sourceEvidenceBoundaryFindings(new Map([["host/source-semantics/local-type-flow/solver.ts", `import { selected } from ${JSON.stringify(specifier)};`]]));
    assert.equal(rows.some(row => row.rule === "host-solver-imports-target-or-storage"), true);
  });
}

test("Native cannot use the private Host entry or an internal Host path", () => {
  for (const specifier of ["@tsonic/host", "@tsonic/host/host-input/reader", "@tsonic/source-core/host", "../../../tsonic/packages/host/src/host-input/reader.js"]) {
    for (const text of [
      `import { reader } from ${JSON.stringify(specifier)};`,
      `export { reader as exposed } from ${JSON.stringify(specifier)};`,
      `type Hidden = import(${JSON.stringify(specifier)}).Input;`,
    ]) assert.equal(findings(text).some(row => row.rule === "native-imports-private-host"), true);
  }
});

test("C# has no remaining Source literal choosers local absence producers or counter induction query", () => {
  const retired = /\b(?:selectCsharpLiteralDeclarationContext|resolveCsharpSourceLiteralTargetType|selectCsharpInferredNumericArrayElement|selectCsharpArrayLiteralElementType|csharpUntypedObjectLiteralIssue|sourceIntegerInduction|sourceBooleanShortCircuitBranch)\b|TSONIC_UNTYPED_(?:OBJECT|ARRAY)_LITERAL/u;
  const remaining = filesUnder(join(root, "src")).filter(file => retired.test(readFileSync(file, "utf8"))).map(file => relative(root, file));
  assert.deepEqual(remaining, []);
});

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(file) : entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [file] : [];
  });
}
