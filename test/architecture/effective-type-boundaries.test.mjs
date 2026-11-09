import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

for (const text of [
  "const cache = new WeakMap<object, number>();",
  "const cache = new WeakSet<object>();",
  "const cache = new Map<object, number>(); export function retain(value: object) { cache.set(value, 1); }",
  "const cache = new Set<object>(); export function retain(value: object) { cache.add(value); }",
  "class Registry { static cache = new WeakMap<object, number>(); }",
  "class Registry { static cache = new WeakSet<object>(); }",
  "class Registry { static cache = new Map<object, number>(); static retain(value: object) { this.cache.set(value, 1); } }",
  "class Registry { static cache = new Set<object>(); } export function retain(value: object) { Registry.cache.add(value); }",
]) test(`Native uses the shared AST lifetime guard for ${text}`, () => {
  assert.equal(findings(text).some(row => row.rule === "module-owned-mutable-cache"), true, text);
});

test("Native lifetime guards accept per-program factories, instance state and immutable metadata", () => {
  assert.deepEqual(findings(`
    const labels = new Map<string, string>([["kind", "value"]]);
    const flags = new Set<string>(["physical", "emission"]);
    export function createView() { const cache = new WeakMap<object, number>(); return { retain(value: object) { cache.set(value, 1); } }; }
    class View { cache = new WeakMap<object, number>(); retain(value: object) { this.cache.set(value, 1); } }
    class PrivateView { #cache = new WeakSet<object>(); retain(value: object) { this.#cache.add(value); } }
    class Metadata { static labels = new Map<string, string>([["kind", "value"]]); }
  `), []);
});

test("the Native evidence owner deletes the Source solver and seals only completed published-fact records", () => {
  const retired = join(root, "src/analysis/source-evidence/types/resolution");
  assert.deepEqual(existsSync(retired) ? filesUnder(retired).map(file => relative(root, file)) : [], []);
  assert.equal(existsSync(join(root, "src/analysis/source-evidence/types/published-callable-interface.ts")), false);
  const owner = readFileSync(join(root, "src/analysis/source-evidence/analyze.ts"), "utf8");
  const data = readFileSync(join(root, "src/target-model/records/program/source-evidence.ts"), "utf8");
  assert.match(owner, /export function createCsharpSourceEvidenceBuilder/u);
  assert.match(owner, /policy\.nativeValue\(occurrence\)/u);
  for (const query of ["memoryMetadata.declaration", "memoryMetadata.value", "closedArrayStorage.resolve"]) {
    assert.equal(owner.includes(`sourceStorage.memory.${query}(occurrence, bindings)`), true, query);
  }
  assert.doesNotMatch(owner, /emptyBindings|values\.occurrences\(|resolveSelectedType|resolveSelectedValue|createTsonic/u);
  assert.match(owner, /const snapshot = new Map\(entries\)/u);
  assert.match(owner, /open = false/u);
  assert.doesNotMatch(data, /\b(?:Signature|TypeChecker|ResolvedSourceGeneratorInfo|ResolvedSourceYieldInfo)\b/u);
  const pointer = readFileSync(join(root, "src/analysis/source-evidence/pointer-backing.ts"), "utf8");
  assert.match(pointer, /memory\.rawLocation\.resolve\(node, bindings\.bindings\)/u);
  assert.doesNotMatch(pointer, /operation\.location|typeFor\(|pointerStorageStates/u);
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
  const provider = readFileSync(join(root, "src/policy/model/provider-calls.ts"), "utf8");
  assert.doesNotMatch(provider, /(?:from\s*["']|import\s*\(["'])[^"']*analysis\//u);
  for (const name of ["CsharpObjectShapeRegistry", "CsharpSelectedCallableMember", "CsharpNativeCallableQueries"]) {
    assert.match(model, new RegExp(`export interface ${name}\\b`, "u"), name);
  }
  const shapes = readFileSync(join(root, "src/analysis/objects/shapes/model.ts"), "utf8");
  assert.doesNotMatch(shapes, /export interface CsharpObjectShapeRegistry\b/u);
  const callables = readFileSync(join(root, "src/analysis/callables/native/native-delegates.ts"), "utf8");
  assert.match(callables, /CsharpNativeDelegateRegistry extends CsharpNativeCallableQueries\b/u);
  assert.doesNotMatch(callables, /export interface CsharpSelectedCallableMember\b/u);
});

test("Native optional and finalized parameter data do not import the Source representation service", () => {
  const data = readFileSync(join(root, "src/target-model/types/native-type-data.ts"), "utf8");
  const model = readFileSync(join(root, "src/target-model/types/model.ts"), "utf8");
  const constraints = readFileSync(join(root, "src/target-model/types/generic-constraints.ts"), "utf8");
  const projections = readFileSync(join(root, "src/target-model/types/projections.ts"), "utf8");
  const representation = readFileSync(join(root, "src/target-model/types/representation.ts"), "utf8");
  for (const name of ["TargetTypeRef", "CsharpTypeParameterConstraint", "CsharpTypeParameterConstraintResolution",
    "CsharpRepresentedTypeParameter", "CsharpOptionalTypeProjection", "CsharpOptionalStorageLayout", "CsharpOptionalProjectedType"]) {
    assert.match(data, new RegExp(`export (?:type|interface) ${name}\\b`, "u"), name);
    for (const [owner, source] of [["model", model], ["constraints", constraints], ["projections", projections]]) {
      assert.doesNotMatch(source, new RegExp(`export\\s+(?:(?:type|interface)\\s+${name}\\b|(?:type\\s*)?\\{[^}]*\\b${name}\\b)`, "u"), owner);
    }
  }
  assert.doesNotMatch(data, /(?:from\s*["']|import\s*\(["'])\./u, "Native reference/constraint/projection data has no internal return edge");
  assert.doesNotMatch(data, /export\s+(?:function|const|class)\b/u, "the one Native data owner contains no operations");
  assert.doesNotMatch(model, /(?:from\s*["']|import\s*\(["'])[^"']*(?:generic-constraints|projections)\.js/u);
  assert.doesNotMatch(representation, /export\s+(?:type\s+CsharpRepresentedTypeParameter\b|type\s*\{[^}]*\bCsharpRepresentedTypeParameter\b)/u);
  for (const [name, source] of [["constraints", constraints], ["projections", projections]]) {
    assert.doesNotMatch(source, /(?:from\s*["']|import\s*\(["'])[^"']*representation\.js/u, name);
    assert.match(source, /from "\.\/native-type-data\.js"/u, name);
  }
  assert.match(representation, /import type \{[^}]*\bCsharpRepresentedTypeParameter\b[^}]*\} from "\.\/native-type-data\.js"/u);
  assert.match(projections, /import type \{[^}]*\bCsharpOptionalTypeProjection\b[^}]*\} from "\.\/native-type-data\.js"/u);
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
  ["checker", 'import type { TypeChecker } from "@tsonic/tsts";'],
  ["checker vocabulary record", 'import type { ResolvedSourceCallInfo } from "@tsonic/tsts";'],
  ["namespace", 'import * as Checked from "@tsonic/tsts";'],
  ["inline import type", 'type Cached = import("@tsonic/tsts").Type;'],
  ["transitive reexport", 'export type { Type as Input } from "@tsonic/tsts";'],
]) {
  test(`Source boundary rejects ${label} without a private resolver exemption`, () => {
    assert.equal(findings(text).some(row => row.rule.startsWith("checker-") || row.rule === "native-checker-type-import"), true, label);
  });
}

for (const name of ["Type", "Symbol", "Signature", "TypeChecker"]) {
  for (const text of [
    `import type { ${name} as Renamed } from "@tsonic/tsts";`,
    `export type { ${name} as Published } from "@tsonic/tsts";`,
    `type Cached = import("@tsonic/tsts").${name};`,
  ]) test(`permanent Native checker ban covers ${text}`, () => {
    assert.equal(findings(text).some(row => row.rule === "native-checker-type-import"), true);
  });
}

for (const name of ["effectiveTypes", "semanticsFor", "sourceFacts"]) {
  for (const text of [
    `const selected = input.${name};`,
    `const selected = input?.${name};`,
    `const selected = input["${name}"];`,
    `const selected = input[\`${name}\`];`,
    `const { ${name}: renamed } = input;`,
    `interface Input { readonly ${name}: Query; }`,
    `interface Input { readonly "${name}": Query; }`,
    `function receive(${name}: Query) { return ${name}; }`,
  ]) test(`permanent retired-accessor ban covers ${text}`, () => {
    assert.equal(findings(text).some(row => row.rule === "retired-source-query-channel"), true);
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
    return entry.isDirectory() ? filesUnder(file) : /\.(?:[cm]?[jt]s|[jt]sx)$/u.test(entry.name) ? [file] : [];
  });
}
