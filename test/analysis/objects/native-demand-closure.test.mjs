import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { compileCsharpRequiredRecordSource, csharpRecordInput } from "../../helpers/required-records.mjs";
import { createCsharpProgramRecords } from "../../../dist/analysis/program/records/create.js";
import { assertCsharpRequiredRecords } from "../../../dist/analysis/program/records/required-records.js";
import { createCsharpObjectShapeDemandEngine } from "../../../dist/analysis/objects/native-demand-requests.js";
import { objectShapeArtifactKey } from "../../../dist/target-model/records/object-shape-demand.js";
import { createCsharpPlanningContext } from "../../../dist/backend/planner/context.js";
import { csharpObjectShapeMemberContractKey } from "../../../dist/target-model/types/object-shape-identity.js";
import { monomorphicStructuralOptionalFiles } from "../../../../tsonic/test/fixtures/generic-structural-methods.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const header = 'import type { int32 } from "@tsonic/core/types.js";';
const programs = [
  ["anonymous parameter and nested field", `export function read(value: { nested: { count: int32 } }): int32 { return value.nested.count; }`],
  ["module initializer and spread return", `const original = { count: 7 as int32 }; export function copy() { return { ...original }; }`],
  ["destructured argument and rest", `export function read({ first, ...rest }: { first: int32; second: int32 }): int32 { return first + rest.second; }`],
  ["capture of exact anonymous storage", `export function maker(seed: int32): () => int32 { const value = { count: seed }; return () => value.count; }`],
  ["receiver-bearing literal method", `export function make(seed: int32) { return { value: seed, read(): int32 { return this.value; } }; }`],
  ["two separate same-role uses", `export function pair(left: int32, right: int32) { const first = { left }; const second = { right }; return { first, second }; }`],
];

for (const surface of ["native", "js"]) for (const [name, body] of programs) {
  test(`${surface}: ${name} has complete immutable artifact demand before planning`, () => {
    const { compiled, program, source, nodes } = compileCsharpRequiredRecordSource(header + body, surface);
    const demand = program.records.objectShapeArtifact;
    assert.equal(Object.isFrozen(demand) && Object.isFrozen(demand.artifacts), true, "one immutable artifact publication");
    assert.equal(demand.artifacts.length > 0, true, "participating anonymous storage has emitted artifacts");
    for (const artifact of demand.artifacts) {
      assert.equal(Object.isFrozen(artifact) && demand.get(artifact.key) === artifact, true, "exact immutable shape identity");
      assert.equal(artifact.dependencies.every(key => demand.get(key) !== undefined), true, "every demanded component is published");
      assert.equal(artifact.key === objectShapeArtifactKey(artifact.fact), true, "canonical target-owned artifact key");
    }
    const context = createCsharpPlanningContext(program);
    assert.equal(Object.hasOwn(context.artifacts, "registerObjectShape") || Object.hasOwn(context.artifacts, "requireObjectShapeCapability") ||
      Object.hasOwn(context.artifacts, "requireObjectShapeProjection") || Object.hasOwn(context.artifacts, "requireObjectShapeMethodReceiver"), false,
    "no decision or mutation API survives in the backend");
    const revision = context.artifacts.revision;
    for (const artifact of demand.artifacts) assert.equal(context.artifacts.objectShape(artifact.fact) === artifact, true,
      "the backend reads exactly the sealed artifact");
    assert.equal(context.artifacts.revision, revision, "render-time demand reads cannot change publication");
    assert.equal([...compiled.artifacts.values()].some(text => text.includes("class ") || text.includes("struct ")), true, "native declarations are emitted");
    const subject = nodes.find(node => source.ast.is.IsFunctionDeclaration(node));
    const row = { family: "objectShapeArtifact", key: demand.artifacts[0].key, subject,
      construct: "native object-shape artifact", producer: "analyzeCsharpNativeArtifactDemand" };
    assertCsharpRequiredRecords(program.records, [row]);
    const missing = Object.freeze({ ...demand, get: key => key === row.key ? undefined : demand.get(key) });
    assert.throws(() => createCsharpProgramRecords({ ...csharpRecordInput(program.records), objectShapeDemand: missing }, [row]),
      /Required C# semantic plan 'objectShapeArtifact'/u, "a missing actual artifact prevents publication");
    const invalidContext = createCsharpPlanningContext({ ...program, records: { ...program.records, objectShapeArtifact: missing } });
    assert.throws(() => invalidContext.artifacts.objectShapeHasCapability(demand.artifacts[0].fact, "json-serialization"),
      /sealed artifact record/u, "an impossible missing record cannot become a false capability answer");
    assert.throws(() => assertCsharpRequiredRecords(program.records, [{ ...row, key: "foreign-owner" }]),
      /Required C# semantic plan 'objectShapeArtifact'/u, "a different artifact is not evidence for this owner");
  });
}

for (const surface of ["native", "js"]) test(`${surface}: authored native method protocols retain their intrinsic receiver ABI`, () => {
  const { program } = compileCsharpRequiredRecordSource(monomorphicStructuralOptionalFiles["index.ts"], surface);
  const implementations = program.records.objectShapeArtifact.artifacts.filter(artifact => artifact.fact.methodImplementation !== undefined &&
    artifact.fact.members.some(member => member.memberKind === "method" && member.methodValueContract !== undefined));
  assert.equal(implementations.length > 0, true, "the actual optional method body has admitted native implementation evidence");
  let nativeMethods = 0;
  for (const artifact of implementations) for (const member of artifact.fact.members) {
    if (member.memberKind !== "method" || member.methodValueContract === undefined || member.methodStorageType !== undefined) continue;
    nativeMethods += 1;
    assert.equal(artifact.receiverBoundMethodKeys.includes(csharpObjectShapeMemberContractKey(member)), false,
      "an authored native method uses this directly, never a synthetic receiver-delegate ABI");
  }
  assert.equal(nativeMethods > 0, true, "the intrinsic receiver assertion covers real native methods");
});

for (const surface of ["native", "js"]) test(`${surface}: an unused optional declaration cannot demand copying native prototype methods`, { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface, sourceText: `
    type Reader = { read<Value>(value: Value): Value };
    interface NamedReader { read<Value>(value: Value): Value; }
    interface UnusedOptional { read?<Value>(value: Value): Value; }
    class ReaderBody { read<Value>(value: Value): Value { return value; } }
    export function run(): boolean {
      const named: NamedReader = new ReaderBody();
      const structural: Reader = new ReaderBody();
      return named.read<number>(17) === 17 && structural.read<number>(19) === 19;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const artifacts = compiled.result.program.records.objectShapeArtifact.artifacts;
  const optional = artifacts.filter(artifact => artifact.fact.members.some(member => member.memberKind === "method" && member.optional === true));
  assert.equal(optional.length > 0, true, "the real checked optional declaration remains represented");
  assert.equal(optional.every(artifact => !artifact.capabilities.includes("method-values")), true,
    "a declaration alone never requests copying a native method");
  assert.equal(artifacts.every(artifact => !artifact.capabilities.includes("method-values")), true,
    "direct named and structural method calls do not gain a copied-value surface");
  executeCsharpConstruction(compiled, `unused-optional-method-demand-${surface}`);
});

test("artifact demand seals once and the backend cannot reach the native query owner", () => {
  let closed = false;
  let reads = 0;
  const type = { kind: "target-named", id: "tsonic.shape:Leaf", csharpAllowsRefLikeTypeArguments: [], csharpRender: { kind: "named", name: "Leaf" } };
  const fact = Object.freeze({ targetType: type, members: Object.freeze([]) });
  const engine = createCsharpObjectShapeDemandEngine({ objectShapes: {
    resolveTarget(selected) { assert.equal(closed, false, "queries run before publication"); reads += 1; return selected === type ? fact : undefined; },
    knownShapes: () => [fact],
  } });
  assert.equal(engine.registerObjectShape(fact, "synthetic").kind, "accepted");
  const demand = engine.seal();
  closed = true;
  const before = reads;
  for (let index = 0; index < 4; index += 1) assert.equal(demand.get(objectShapeArtifactKey(fact)).fact === fact, true, "same fixed record");
  assert.equal(reads, before, "no native-query recomputation after publication");
  assert.throws(() => engine.registerObjectShape(fact, "synthetic"), /artifact demand is sealed/u);
  assert.throws(() => engine.seal(), /artifact demand is sealed/u);
});

test("erased metadata is not an extra demand root and retained source refusals still precede planning", () => {
  const options = { targetOptions: { languageDialect: "csharp15-preview", memorySafetyRules: "preview" } };
  const plain = compileCsharpSource({ ...options, sourceText: header + "export const count: int32 = 1;" });
  const erased = compileCsharpSource({ ...options, sourceText: header + `
    import { safety } from "@tsonic/core/lang.js";
    safety(() => { const ignored = { nested: { count: 5 as int32 } }; return ignored; }).requiresunsafe();
    export const count: int32 = 1;
  ` });
  assertCsharpCompilationSucceeded(plain);
  assertCsharpCompilationSucceeded(erased);
  assert.deepEqual([...erased.artifacts], [...plain.artifacts], "erased bodies cannot add native declarations or effects");
  assert.equal(erased.result.program.records.objectShapeArtifact.artifacts.length, plain.result.program.records.objectShapeArtifact.artifacts.length,
    "erased bodies do not create artifact roots");
  const compiled = compileCsharpSource({ sourceText: header + `
    import { sharedborrow } from "@tsonic/core/lang.js";
    export function main(value: int32): int32 { sharedborrow(value); return value; }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "", "source checking succeeds for the actual native rejection control");
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
    "the source-flow rejection happens before seal, planning and emission");
  assert.equal(compiled.result.diagnostics.some(diagnostic => diagnostic.code === "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED"), true,
    "the existing precise source rejection is not relabelled as an invariant");
});

for (const [name, sourceText] of [
  ["module initializer", "export const value = new Proxy({}, {});"],
  ["returned construction", "export function make(): unknown { return new Proxy({}, {}); }"],
  ["parenthesized construction", "export const value = (new Proxy({}, {}));"],
  ["conditional construction", "export function make(flag: boolean): unknown { return flag ? new Proxy({}, {}) : {}; }"],
  ["invoked closure", "export const value = (() => new Proxy({}, {}))();"],
]) test(`participating ${name} retains its native constructor rejection before publication`, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText });
  assert.equal(compiled.sourceDiagnosticsText, "", "the checked constructor reaches the actual native refusal owner");
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
    "an actual unsupported construction is refused before publication and never emulated");
  assert.equal(compiled.result.diagnostics.some(diagnostic => diagnostic.code === "TS9101002" &&
    diagnostic.message === "Proxy traps redefine object operations dynamically and have no closed C# source-to-source representation."), true,
    "the exact supported diagnostic is retained, not an internal failure");
  assert.equal(compiled.result.diagnostics.length, 1, "the exact participating constructor has one owning refusal");
  assert.equal(compiled.source.ast.is.IsNewExpression(compiled.result.diagnostics[0].sourceNode), true, "the refusal is on its actual constructor source");
});

test("a native class named Proxy is not confused with the unsupported source-profile constructor", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: "class Proxy {} export const value = new Proxy();" });
  assertCsharpCompilationSucceeded(compiled);
  assert.equal(compiled.artifacts.size > 0, true, "the selected native constructor remains admitted without a name-based rejection");
});

test("constructor refusals and other participating native refusals share one complete pre-seal result", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    export const value = new Proxy({}, {});
    function tag(parts: TemplateStringsArray, count: number): string { return "constant"; }
    export function run(count: number): string { return tag\`value=\${count}\`; }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "", "both refused constructs are valid checked source");
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
    "neither known source refusal becomes published or planned");
  const diagnostics = compiled.result.diagnostics;
  assert.equal(diagnostics.length, 2, "the constructor cannot hide a different pending source refusal");
  assert.equal(diagnostics.some(diagnostic => diagnostic.code === "TS9101002" &&
    diagnostic.message === "Proxy traps redefine object operations dynamically and have no closed C# source-to-source representation."), true,
  "exact constructor diagnostic transport");
  assert.equal(diagnostics.some(diagnostic => diagnostic.code === "CSHARP_UNSUPPORTED_AST" &&
    diagnostic.message === "Expression is outside the current C# planning surface."), true, "the existing independent native refusal is retained");
  const tagged = diagnostics.find(diagnostic => diagnostic.code === "CSHARP_UNSUPPORTED_AST");
  assert.equal(compiled.source.ast.is.IsTaggedTemplateExpression(tagged.sourceNode), true,
    "the independent refusal belongs to the actual tagged template, not an unrelated tag-body operation");
});
