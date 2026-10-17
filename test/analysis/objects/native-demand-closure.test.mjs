import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { compileCsharpRequiredRecordSource, csharpRecordInput } from "../../helpers/required-records.mjs";
import { createCsharpProgramRecords } from "../../../dist/analysis/program/records/create.js";
import { assertCsharpRequiredRecords } from "../../../dist/analysis/program/records/required-records.js";
import { createCsharpObjectShapeDemandEngine } from "../../../dist/analysis/objects/native-demand-requests.js";
import { objectShapeArtifactKey } from "../../../dist/target-model/records/object-shape-demand.js";
import { createCsharpPlanningContext } from "../../../dist/backend/planner/context.js";
import { csharpTargetTypeRenderingRejection, csharpTargetTypeRendersAsUnqualifiedIdentifier } from "../../../dist/policy/types/model/renderability.js";
import { csharpTypeFromTargetTypeRef } from "../../../dist/backend/planner/types/target-type-rendering.js";
import { csharpVoidTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

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

test("the pre-seal renderer predicate and syntax renderer agree on the existing rule", () => {
  const named = shape => ({ kind: "target-named", id: "Control", csharpAllowsRefLikeTypeArguments: [], csharpRender: shape });
  const controls = [
    { kind: "source-primitive", name: "int32" },
    { kind: "opaque", id: "unsupported" },
    named({ kind: "named", name: "Value" }),
    named({ kind: "named", name: "Value", usingNamespace: [] }),
    named({ kind: "predefined", name: "int" }),
    named({ kind: "nullable" }),
    { kind: "type-parameter", identity: "invalid", name: "$value" },
    { kind: "function-pointer", args: [], result: csharpVoidTargetType(), abi: ["managed", "Cdecl"] },
    { kind: "function-pointer", args: [], result: csharpVoidTargetType(), abi: ["unmanaged", "Cdecl"] },
  ];
  for (const [index, type] of controls.entries()) {
    const syntax = csharpTypeFromTargetTypeRef(type, undefined);
    assert.equal(csharpTargetTypeRenderingRejection(type) === undefined, syntax !== undefined, `renderer admission control ${index}`);
    assert.equal(csharpTargetTypeRendersAsUnqualifiedIdentifier(type), syntax?.kind === "IdentifierName", `unqualified identifier control ${index}`);
  }
  const invalid = named({ kind: "named", name: "value-with-hyphen", namespace: ["namespace-with-hyphen"] });
  assert.throws(() => csharpTypeFromTargetTypeRef(invalid, undefined), /Invalid C# identifier/u, "the existing renderer refuses invalid native names");
  assert.equal(csharpTargetTypeRenderingRejection(invalid)?.reason, "invalid-name", "the identical refusal is available before planning");
  assert.equal(csharpTargetTypeRendersAsUnqualifiedIdentifier(invalid), false, "invalid native names cannot be generated identifiers");
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

test("participating unsupported construction retains its native rejection before publication", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: "export const value = new Proxy({}, {});" });
  assert.equal(compiled.sourceDiagnosticsText, "", "the checked constructor reaches the actual native refusal owner");
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
    "an actual unsupported construction is refused before publication and never emulated");
  assert.equal(compiled.result.diagnostics.some(diagnostic => diagnostic.code === "CSHARP_JS_SOURCE_PROFILE_OPERATION_UNSUPPORTED" &&
    diagnostic.message === "Proxy traps redefine object operations dynamically and have no closed C# source-to-source representation."), true,
    "the exact supported diagnostic is retained, not an internal failure");
});
