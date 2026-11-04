import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { effectiveTypeBoundaryFindings } from "./effective-type-boundaries.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

test("C# value types cannot bypass node-keyed effective types or enter Type-keyed result maps", () => {
  const sources = new Map(filesUnder(join(root, "src")).map(file => [relative(root, file), readFileSync(file, "utf8")]));
  const host = join(dirname(root), "tsonic/packages/target-api/src/source-semantics/local-type-flow");
  for (const file of filesUnder(host)) sources.set(`host/source-semantics/local-type-flow/${relative(host, file)}`, readFileSync(file, "utf8"));
  const findings = effectiveTypeBoundaryFindings(sources);
  assert.deepEqual(findings.map(row => `${row.file}:${row.line}: ${row.rule}`), []);
});

for (const [label, code] of [
  ["direct expression type", "types.resolveType(queries.types.expressionType(node), file);"],
  ["declared value type", "types.resolveType(queries.declarations.declaredValueType(node), file);"],
  ["symbol value type", "types.resolveType(queries.types.typeOfSymbol(symbol), file);"],
  ["declared symbol type", "types.resolveType(queries.types.declaredSymbolType(symbol), file);"],
  ["write symbol type", "types.resolveType(queries.types.writeSymbolType(symbol), file);"],
  ["refinement", "types.resolveType(selectValueTypeRefinement(node), file);"],
  ["receiver record", "types.resolveType(source.receiver.type, file);"],
  ["argument record", "types.resolveType(source.argument.type, file);"],
  ["read record", "types.resolveType(source.sourceReadType, file);"],
  ["write record", "types.resolveType(source.sourceWriteType, file);"],
  ["element record", "types.resolveType(source.sourceElementType, file);"],
  ["result record", "types.resolveType(source.sourceResultType, file);"],
  ["selected signature", "types.resolveType(source.selectedSignature, file);"],
  ["selected generic vector", "resolveSemanticTypeArguments(scope, source.sourceSelectedMethodTypeArguments);"],
  ["selected parameter vector", "deriveMembers(source.sourceSelectedSignatureParameters);"],
  ["local alias", "const first = queries.types.expressionType(node); const second = first; types.resolveType(second, file);"],
  ["destructured argument", "const { type: selected } = source.argument; types.resolveType(selected, file);"],
  ["converter function alias", "const convert = types.resolveType; convert(queries.types.expressionType(node), file);"],
  ["value through helper parameter", "function convert(type) { return types.resolveType(type, file); } convert(queries.types.expressionType(node));"],
  ["value through helper return", "function selected() { return source.argument.type; } types.resolveType(selected(), file);"],
]) {
  test(`effective-type architecture rejects ${label}`, () => {
    const findings = effectiveTypeBoundaryFindings(new Map([["src/analysis/source-evidence/types/resolution/semantic-types.ts", `function example() { ${code} }`]]));
    assert.equal(findings.some(row => row.rule === "value-type-reaches-converter"), true, label);
  });
}

test("a declaration-only allowance cannot authorize a value-bearing argument", () => {
  const file = "src/analysis/example.ts";
  const source = "function declaration() { return types.resolveType(queries.types.expressionType(node), file); }";
  const allowance = { file, owner: "declaration", callee: "types.resolveType", argument: "queries.types.expressionType(node)" };
  const findings = effectiveTypeBoundaryFindings(new Map([[file, source]]), [allowance]);
  assert.equal(findings.some(row => row.rule === "value-type-reaches-converter"), true);
});

test("converter data flow follows the checked Type argument rather than unrelated Native scope state", () => {
  const path = "src/analysis/source-evidence/types/resolution/semantic-types.ts";
  const prefix = "const scope = { current: queries.types.expressionType(node) };";
  const declared = effectiveTypeBoundaryFindings(new Map([[path,
    `function example() { ${prefix} bindCsharpSourceTypeArguments(scope, declared, queries, state, source); }`]]));
  assert.equal(declared.some(row => row.rule === "value-type-reaches-converter"), false,
    "Native context is not the Type converted by the canonical resolver contract");
  const value = effectiveTypeBoundaryFindings(new Map([[path,
    `function example() { ${prefix} bindCsharpSourceTypeArguments(scope, queries.types.expressionType(node), queries, state, source); }`]]));
  assert.equal(value.some(row => row.rule === "value-type-reaches-converter"), true,
    "a raw checked value in the actual Type position is still rejected");
});

test("an outside-domain fallback needs an earlier returning gate for the identical occurrence", () => {
  const path = "src/analysis/source-evidence/types/resolution/semantic-types.ts";
  const selected = "types.resolveType(queries.types.expressionType(node), file);";
  const gate = "if (host.effectiveTypes.get(node) !== undefined) return resolveNode(node);";
  const accepted = effectiveTypeBoundaryFindings(new Map([[path, `function resolve(node) { ${gate} ${selected} }`]]));
  assert.equal(accepted.some(row => row.rule === "value-type-reaches-converter"), false, "the raw fallback cannot run for a published occurrence");
  for (const [label, source] of [
    ["foreign occurrence", `function resolve(node, other) { if (host.effectiveTypes.get(other) !== undefined) return resolveNode(other); ${selected} }`],
    ["late gate", `function resolve(node) { ${selected} ${gate} }`],
    ["fallthrough after a missing native result", `function resolve(node) { if (host.effectiveTypes.get(node) !== undefined) { const value = resolveNode(node); if (value !== undefined) return value; } ${selected} }`],
  ]) {
    const findings = effectiveTypeBoundaryFindings(new Map([[path, source]]));
    assert.equal(findings.some(row => row.rule === "value-type-reaches-converter"), true, label);
  }
});

test("conditional fallback branches require absence at the identical operation occurrence", () => {
  const path = "src/analysis/source-evidence/types/resolution/semantic-types.ts";
  for (const [label, condition, accepted] of [
    ["same absent occurrence", "effective === undefined", true],
    ["present occurrence", "effective !== undefined", false],
    ["different occurrence", "other === undefined", false],
  ]) {
    const findings = effectiveTypeBoundaryFindings(new Map([[path, `function resolve(node, other) {
      const effective = resolveCsharpSourceEffectiveType(scope, node, state);
      return ${condition} ? types.resolveType(queries.types.expressionType(node), file) : undefined;
    }`]]));
    assert.equal(findings.some(row => row.rule === "value-type-reaches-converter"), !accepted, label);
  }
});

test("classified Source metadata never authorizes another leaf or another operation", () => {
  const file = "src/analysis/example.ts";
  const allowance = { file, owner: "declaration", callee: "types.resolveType", argument: "source.sourceElementType", metadataLeaf: "source.sourceElementType" };
  const declared = effectiveTypeBoundaryFindings(new Map([[file, "function declaration() { return types.resolveType(source.sourceElementType, file); }"]]), [allowance]);
  assert.equal(declared.length, 0, "the individually classified for-in key contract is metadata rather than the iterable value");
  const changed = effectiveTypeBoundaryFindings(new Map([[file, "function declaration() { return types.resolveType(source.sourceReadType, file); }"]]), [allowance]);
  assert.equal(changed.some(row => row.rule === "value-type-reaches-converter"), true, "a read value never inherits a metadata disposition");
  assert.equal(changed.some(row => row.rule === "unclassified-type-only-converter"), true, "the exact classified argument must still match");
});

test("declaration-only allowances are exact and cannot silently survive removed call sites", () => {
  const file = "src/analysis/example.ts";
  const allowance = { file, owner: "declaration", callee: "types.resolveType", argument: "declared" };
  const accepted = effectiveTypeBoundaryFindings(new Map([[file, "function declaration() { return types.resolveType(declared, file); }"]]), [allowance]);
  assert.equal(accepted.length, 0, "one explicitly classified declaration call remains supported");
  const changed = effectiveTypeBoundaryFindings(new Map([[file, "function declaration() { return types.resolveType(other, file); }"]]), [allowance]);
  assert.equal(changed.some(row => row.rule === "unclassified-type-only-converter"), true, "a changed argument is not covered");
  assert.equal(changed.some(row => row.rule === "stale-declaration-converter-allowance"), true, "the removed exact row must be deleted");
});

for (const [label, source] of [
  ["value map", "const types = new Map<Type, TargetTypeRef>(); types.get(source.argument.type);"],
  ["nested value map", "const values = new Map<Node, Map<Type, TargetTypeRef>>();"],
  ["map alias", "const types = new Map<Type, TargetTypeRef>(); const alias = types; alias.get(selected);"],
  ["annotated map", "const types: Map<Type, TargetTypeRef> = new Map(); types.get(selected);"],
  ["renamed checked Type import", 'import type { Type as CheckedType } from "@tsonic/tsts"; const types = new Map<CheckedType, TargetTypeRef>(); types.get(selected);'],
  ["renamed native carrier import", 'import type { Type, TargetTypeRef as Carrier } from "fixture"; const types = new Map<Type, Carrier>(); types.get(selected);'],
  ["property-held map", "class Store { carriers: Map<Type, TargetTypeRef> = new Map(); read(type: Type) { return this.carriers.get(type); } }"],
  ["annotated profile channel", "interface Inputs { types: Map<Type, TargetTypeRef>; }"],
  ["published profile channel", "return operation.inputs.types.get(operation.sourceResultType);"],
]) {
  test(`effective-type architecture rejects ${label}`, () => {
    const findings = effectiveTypeBoundaryFindings(new Map([["src/analysis/example.ts", source]]));
    assert.equal(findings.some(row => row.rule === "type-keyed-value-result" || row.rule === "type-keyed-carrier-map"), true, label);
  });
}

for (const specifier of ["../../target-analysis/source-storage/index.js", "tsonic-csharp/target-model/types.js", "tsonic-rust/policy.js"]) {
  test(`Host type flow cannot import ${specifier}`, () => {
    const findings = effectiveTypeBoundaryFindings(new Map([["host/source-semantics/local-type-flow/solver.ts", `import { selected } from ${JSON.stringify(specifier)};`]]));
    assert.equal(findings.some(row => row.rule === "host-solver-imports-target-or-storage"), true);
  });
}

test("node-keyed carrier maps and provider identity relations are not value-type converter violations", () => {
  const findings = effectiveTypeBoundaryFindings(new Map([["src/analysis/example.ts", `
    const values = new Map<Node, TargetTypeRef>();
    values.get(expression);
    host.providers.resolveType(declaration);
    catalog.relationCatalog.resolveType(identity);
  `]]));
  assert.equal(findings.length, 0);
});

test("the private declaration-only resolver cache remains valid but cannot consume value-origin keys", () => {
  const path = "src/analysis/source-evidence/types/resolution/query-cache.ts";
  const cache = "const semanticTypes = new WeakMap<Type, WeakMap<SourceFile, TargetTypeRef>>();";
  assert.equal(effectiveTypeBoundaryFindings(new Map([[path, `${cache} semanticTypes.get(declared);`]])).length, 0,
    "the existing private declared-Type cache is not a second value-result publication channel");
  const findings = effectiveTypeBoundaryFindings(new Map([[path, `${cache} semanticTypes.get(queries.types.expressionType(node));`]]));
  assert.equal(findings.some(row => row.rule === "type-keyed-value-result"), true,
    "private resolver ownership never authorizes a raw value type as a result key");
});

test("C# has no remaining Source literal choosers local absence producers or counter induction query", () => {
  const retired = /\b(?:selectCsharpLiteralDeclarationContext|resolveCsharpSourceLiteralTargetType|selectCsharpInferredNumericArrayElement|selectCsharpArrayLiteralElementType|csharpUntypedObjectLiteralIssue|sourceIntegerInduction)\b|TSONIC_UNTYPED_(?:OBJECT|ARRAY)_LITERAL/u;
  const remaining = filesUnder(join(root, "src")).filter(file => retired.test(readFileSync(file, "utf8"))).map(file => relative(root, file));
  assert.deepEqual(remaining, [], "Host rules replace the old C# decisions in the same unit; Native admission remains at its existing owners");
});

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}
