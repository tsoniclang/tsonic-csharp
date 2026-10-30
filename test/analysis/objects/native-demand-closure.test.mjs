import assert from "node:assert/strict";
import { collectJsonType } from "../../../dist/analysis/objects/native-demand-closure.js";
import { maximumJsonClosureDepth } from "../../../dist/analysis/objects/native-demand-batches.js";
import { csharpAbsenceTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { compileCsharpRequiredRecordSource, csharpRecordInput } from "../../helpers/required-records.mjs";
import { createCsharpProgramRecords } from "../../../dist/analysis/program/records/create.js";
import { assertCsharpRequiredRecords } from "../../../dist/analysis/program/records/objects/required-records.js";
import { createCsharpObjectShapeDemandEngine } from "../../../dist/analysis/objects/native-demand-requests.js";
import { publishCsharpNativeArtifactDemand } from "../../../dist/analysis/program/records/native/native-demand.js";
import { objectShapeArtifactKey } from "../../../dist/target-model/records/objects/object-shape-keys.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { createCsharpPlanningContext } from "../../../dist/backend/planner/context.js";
import { csharpObjectShapeArtifact } from "../../../dist/backend/planner/artifacts/object-shapes.js";
import { csharpObjectShapeMemberContractKey } from "../../../dist/target-model/types/object-shape-identity.js";
import { monomorphicStructuralOptionalFiles } from "../../../../tsonic/test/fixtures/generic-structural-methods.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("closed JSON admits one exact native absence without admitting foreign or unbounded data", () => {
  const scope = {
    host: { objectShapes: { resolveTarget: () => undefined }, typeDefinitions: undefined },
    collectJsonShape: () => assert.fail("native absence has no object shape or serialization adapter"),
    collectJsonType: (type, preferred, state) => collectJsonType(scope, type, preferred, state),
  };
  const absent = csharpAbsenceTargetType();
  for (const [name, type] of [["absence", absent], ["absence array", { kind: "array", element: absent }]]) {
    const state = { depth: 0, visiting: new Set(), collected: new Map() };
    assert.equal(collectJsonType(scope, type, undefined, state), undefined, `${name}: the existing native null writer is sufficient`);
    assert.equal(state.depth, 0, "successful closure releases its original finite-depth charge");
    assert.equal(state.collected.size, 0, "native absence creates no adapter or object artifact");
  }
  for (const type of [{ kind: "target-named", id: "foreign.native.absence" }, { kind: "opaque", id: "unclosed" }]) {
    const state = { depth: 0, visiting: new Set(), collected: new Map() };
    assert.equal(typeof collectJsonType(scope, type, undefined, state), "string", "unknown or foreign storage is still refused precisely");
    assert.equal(state.depth, 0, "refused closure releases its original finite-depth charge");
  }
  let nested = absent;
  for (let index = 0; index <= maximumJsonClosureDepth; index++) nested = { kind: "array", element: nested };
  const state = { depth: 0, visiting: new Set(), collected: new Map() };
  assert.match(collectJsonType(scope, nested, undefined, state), /finite depth limit/u, "an absence leaf cannot bypass the finite closure budget");
  assert.equal(state.depth, 0, "budget refusal unwinds every actual nested charge");
});

const header = 'import type { int32 } from "@tsonic/core/types.js";';
const programs = [
  ["anonymous parameter and nested field", `export function read(value: { nested: { count: int32 } }): int32 { return value.nested.count; }`],
  ["module initializer and spread return", `const original = { count: 7 as int32 }; export function copy() { return { ...original }; }`],
  ["destructured argument and rest", `export function read({ first, ...rest }: { first: int32; second: int32 }): int32 { return first + rest.second; }`],
  ["capture of exact anonymous storage", `export function maker(seed: int32): () => int32 { const value = { count: seed }; return () => value.count; }`],
  ["receiver-bearing literal method", `export function make(seed: int32) { return { value: seed, read(): int32 { return this.value; } }; }`],
  ["two separate same-role uses", `export function pair(left: int32, right: int32) { const first = { left }; const second = { right }; return { first, second }; }`],
];

for (const surface of ["native", "js"]) test(`${surface}: selected native generic projections publish their exact constructible shape`, () => {
  const { compiled, program, nodes } = compileCsharpRequiredRecordSource(`
import { JsonSerializer } from "@tsonic/dotnet/System.Text.Json.js";
import type { int32 } from "@tsonic/core/types.js";
export interface Input { title: string; count: int32; }
export function parse(json: string): Input | undefined { return JsonSerializer.Deserialize<Input>(json); }
`, surface);
  assertCsharpCompilationSucceeded(compiled);
  const projections = nodes.flatMap(node => [program.records.selectedCall.get(node), program.records.selectedConstruction.get(node)]
    .flatMap(classification => classification?.methodTypeArgumentProjections ?? []))
    .filter(entry => entry.projection.kind === "resolved");
  assert.equal(projections.length, 1, "the native generic call has one checked constructible projection");
  for (const { projection } of projections) {
    const artifact = program.records.objectShapeArtifact.get(objectShapeArtifactKey(projection.shape));
    assert.equal(artifact !== undefined, true, "the selected physical shape is demanded before sealing");
    assert.equal(artifact?.materialization, "synthetic", "an interface result uses its actual constructible implementation");
    assert.equal(program.records.objectShapeEmission.get(projection.shape)?.kind, "synthetic", "the renderer receives the sealed native materialization");
    assert.equal(artifact?.dependencies.every(key => program.records.objectShapeArtifact.get(key) !== undefined), true,
      "the actual projected native generic shape has every required component");
  }
});

for (const surface of ["native", "js"]) for (const [name, body] of programs) {
  test(`${surface}: ${name} has complete immutable artifact demand before planning`, () => {
    const { compiled, program, source, nodes } = compileCsharpRequiredRecordSource(header + body, surface);
    const demand = program.records.objectShapeArtifact;
    assert.equal(Object.isFrozen(demand) && Object.isFrozen(demand.artifacts), true, "one immutable artifact publication");
    assert.equal(demand.targetShapes === program.objectShapes.targetShapes && Object.isFrozen(demand.targetShapes), true,
      "artifact demand transports the canonical completed target-shape index by identity");
    assert.equal(demand.artifacts.length > 0, true, "participating anonymous storage has emitted artifacts");
    for (const artifact of demand.artifacts) {
      assert.equal(Object.isFrozen(artifact) && demand.get(artifact.key) === artifact, true, "exact immutable shape identity");
      assert.equal(artifact.dependencies.every(key => demand.get(key) !== undefined), true, "every demanded component is published");
      assert.equal(artifact.key === objectShapeArtifactKey(artifact.fact), true, "canonical target-owned artifact key");
    }
    const context = createCsharpPlanningContext(program);
    assert.equal(Object.hasOwn(context, "artifacts") || Object.isFrozen(context) === false, false,
      "no artifact graph, decision or mutation API survives in the backend");
    assert.equal(context.program.records.objectShapeArtifact === demand, true, "the backend holds the sealed demand by identity");
    for (const artifact of demand.artifacts) assert.equal(csharpObjectShapeArtifact(context, artifact.fact) === artifact, true,
      "the backend reads exactly the sealed artifact");
    assert.equal(demand.artifacts.every(artifact => demand.get(artifact.key) === artifact), true, "render-time demand reads cannot change publication");
    assert.equal([...compiled.artifacts.values()].some(text => text.includes("class ") || text.includes("struct ")), true, "native declarations are emitted");
    const subject = nodes.find(node => source.ast.is.IsFunctionDeclaration(node));
    const row = { family: "objectShapeArtifact", key: demand.artifacts[0].key, subject,
      construct: "native object-shape artifact", producer: "analyzeCsharpNativeArtifactDemand" };
    assertCsharpRequiredRecords(program.records, [row]);
    const missing = Object.freeze({ ...demand, get: key => key === row.key ? undefined : demand.get(key) });
    assert.throws(() => createCsharpProgramRecords(csharpRecordInput({ ...program.records, objectShapeArtifact: missing }), [row]),
      /Required C# semantic plan 'objectShapeArtifact'/u, "a missing actual artifact prevents publication");
    const invalidContext = createCsharpPlanningContext({ ...program, records: { ...program.records, objectShapeArtifact: missing } });
    assert.throws(() => csharpObjectShapeArtifact(invalidContext, demand.artifacts[0].fact),
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
    if (member.memberKind !== "method" || member.methodValueContract === undefined || member.methodValueStorage !== undefined) continue;
    nativeMethods += 1;
    assert.equal(artifact.receiverBoundMethodKeys.includes(csharpObjectShapeMemberContractKey(member)), false,
      "an authored native method uses this directly, never a synthetic receiver-delegate ABI");
  }
  assert.equal(nativeMethods > 0, true, "the intrinsic receiver assertion covers real native methods");
});

for (const surface of ["native", "js"]) test(`${surface}: source-only generic method storage is not an emitted native artifact`, { timeout: 300_000 }, () => {
  const { compiled, program, source, nodes } = compileCsharpRequiredRecordSource(header + `
    type UnconsumedIdentity = { unconsumedIdentity<Value>(value: Value): Value; };
    interface Identity { identity<Value>(value: Value): Value; }
    export function identity(): Identity { return { identity<Value>(value: Value): Value { return value; } }; }
    export function run(): boolean { return identity().identity<int32>(7 as int32) === 7; }
  `, surface);
  const alias = nodes.find(node => source.ast.is.IsTypeAliasDeclaration(node) &&
    source.ast.text(source.ast.name(node)) === "UnconsumedIdentity");
  assert.equal(alias !== undefined, true, "the negative control is a real checked private alias");
  const viewNode = source.ast.typeNode(alias);
  assert.equal(viewNode !== undefined && source.ast.is.IsTypeLiteralNode(viewNode), true,
    "the negative control has its own authored structural source view");
  const sourceOnly = program.records.nodeObjectShape.get(viewNode);
  assert.equal(sourceOnly !== undefined, true, "the source-only view was classified and sealed before artifact demand");
  const memberDeclaration = nodes.find(node => source.ast.is.IsMethodSignatureDeclaration(node) &&
    source.ast.text(source.ast.name(node)) === "unconsumedIdentity");
  const sourceOnlyMember = sourceOnly.members.find(member => member.sourceName === "unconsumedIdentity");
  assert.equal(memberDeclaration !== undefined && sourceOnlyMember?.memberKind === "method" &&
    sourceOnlyMember.typeParameters?.length === 1 && sourceOnlyMember.sourceDeclarations?.includes(memberDeclaration) === true &&
    sourceOnly.methodImplementation === undefined, true,
    "the absent artifact witness is actual checked generic source evidence, not a manufactured implementation");
  const literal = nodes.find(node => source.ast.is.IsObjectLiteralExpression(node));
  const selected = program.records.nativeExpression.get(literal)?.use;
  const storage = program.records.storageType.get(literal);
  assert.equal(selected !== undefined && selected.kind !== "erased" && selected.objectShape !== undefined && storage !== undefined, true,
    "the control has its actual physical storage and native construction");
  const physical = selected.objectShape;
  const completed = program.records.objectShapeArtifact.targetShapes[targetTypeRefKey(physical.targetType)];
  assert.equal(completed !== undefined && program.records.objectShapeArtifact.get(objectShapeArtifactKey(physical))?.fact === completed, true,
    "the actual native body carrier is retained by its canonical completed identity");
  assert.equal(physical.methodImplementation !== undefined && completed.methodImplementation?.identity === physical.methodImplementation.identity, true,
    "completion preserves the exact admitted native method implementation rather than manufacturing a body from its source-only view");
  assert.equal(targetTypeRefKey(storage) === targetTypeRefKey(physical.targetType), true,
    "physical storage is not mislabelled as an unconsumed logical view");
  assert.equal(targetTypeRefKey(sourceOnly.targetType) !== targetTypeRefKey(physical.targetType), true,
    "the source-only generic method view is not mistaken for its physical implementation");
  assert.equal(program.records.objectShapeArtifact.get(objectShapeArtifactKey(sourceOnly)) === undefined, true,
    "no unconstructed source-only generic method declaration is invented");
  assert.equal(program.records.objectShapeArtifact.artifacts.some(artifact =>
    targetTypeRefKey(artifact.fact.targetType) === targetTypeRefKey(sourceOnly.targetType)), false,
    "the source-only view is not emitted under an alternate artifact entry");
  executeCsharpConstruction(compiled, `artifact-demand-physical-method-${surface}`);
});

for (const surface of ["native", "js"]) test(`${surface}: required physical bindings without an initializer retain their declared artifact`, { timeout: 300_000 }, () => {
  const { compiled, program, source, nodes } = compileCsharpRequiredRecordSource(header + `
    export function run(): boolean {
      let value: { count: int32 };
      value = { count: 7 as int32 };
      return value.count === 7;
    }
  `, surface);
  const declaration = nodes.find(node => source.ast.is.IsVariableDeclaration(node) &&
    source.ast.as.AsVariableDeclaration(node)?.Initializer === undefined);
  const carrier = program.records.storageType.get(declaration);
  const shape = program.objectShapes.resolveTarget(carrier);
  assert.equal(carrier !== undefined && shape !== undefined, true, "the actual uninitialized native binding has its exact physical carrier");
  assert.equal(program.records.objectShapeArtifact.get(objectShapeArtifactKey(shape))?.fact === shape, true,
    "a required native declaration is not dropped with source-only expression views");
  executeCsharpConstruction(compiled, `artifact-demand-uninitialized-binding-${surface}`);
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
  const targetShapes = Object.freeze({ [targetTypeRefKey(type)]: fact });
  const engine = createCsharpObjectShapeDemandEngine({ objectShapes: {
    targetShapes,
    resolveTarget(selected) { assert.equal(closed, false, "queries run before publication"); reads += 1; return selected === type ? fact : undefined; },
    knownShapes: () => [fact],
  }, ast: {}, captureStorage: { captureFrameShape: { get() {} } },
    conversions: { conversion: { get() {} } } });
  assert.equal(engine.registerObjectShape(fact, "synthetic").kind, "accepted");
  const closure = engine.close();
  closed = true;
  const closedReads = reads;
  const demand = publishCsharpNativeArtifactDemand(closure, { typeParameterNames: [] });
  assert.equal(reads, closedReads, "final name publication never re-enters native artifact demand");
  assert.equal(demand.targetShapes === targetShapes && Object.isFrozen(demand.targetShapes), true,
    "the immutable completed lookup is transported without reindexing");
  closed = true;
  const before = reads;
  for (let index = 0; index < 4; index += 1) assert.equal(demand.get(objectShapeArtifactKey(fact)).fact === fact, true, "same fixed record");
  assert.equal(reads, before, "no native-query recomputation after publication");
  assert.throws(() => engine.registerObjectShape(fact, "synthetic"), /artifact demand is sealed/u);
  assert.throws(() => engine.close(), /artifact demand is sealed/u);
  assert.equal(Object.hasOwn(engine, "seal"), false, "the retired demand-and-publication API is absent");
});

test("artifact demand requires its canonical immutable completed shape index at sealing", () => {
  for (const targetShapes of [undefined, {}]) {
    const engine = createCsharpObjectShapeDemandEngine({ objectShapes: { targetShapes, resolveTarget() {} },
      ast: {}, captureStorage: { captureFrameShape: { get() {} } },
      conversions: { conversion: { get() {} } } });
    assert.throws(() => engine.close(), /immutable completed target-shape index/u,
      "a missing or mutable input cannot become a published artifact DTO");
  }
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
  assert.equal(compiled.result.diagnostics.some(diagnostic => diagnostic.code === "CSHARP_JS_SOURCE_PROFILE_OPERATION_UNSUPPORTED" &&
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

for (const [name, sourceText] of [
  ["returned call", "export function make(target: object): object { return Proxy.revocable(target, {}); }"],
  ["module initializer", "export const value = Proxy.revocable({}, {});"],
  ["conditional call", "export function make(flag: boolean): object { return flag ? Proxy.revocable({}, {}) : {}; }"],
  ["invoked closure", "export const value = (() => Proxy.revocable({}, {}))();"],
]) test(`participating ${name} retains its source-profile call rejection before native result admission`, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText });
  assert.equal(compiled.sourceDiagnosticsText, "", "the original call is valid checked source");
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
    "an unsupported source operation publishes no native program, plan or artifacts");
  assert.equal(compiled.result.diagnostics.length, 1, "the selected operation has one precise refusal");
  const diagnostic = compiled.result.diagnostics[0];
  assert.equal(diagnostic.code, "CSHARP_JS_SOURCE_PROFILE_OPERATION_UNSUPPORTED");
  assert.equal(diagnostic.message, "Proxy traps redefine object operations dynamically and have no closed C# source-to-source representation.");
  assert.equal(compiled.source.ast.is.IsCallExpression(diagnostic.sourceNode), true, "the exact call owns its native admission refusal");
});

test("a native class static method named Proxy.revocable retains its actual selected identity", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    class Proxy { static revocable(value: object): object { return value; } }
    export function run(value: object): object { return Proxy.revocable(value); }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  assert.equal(compiled.artifacts.size > 0, true, "the native static call is not rejected by source spelling");
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
  assert.equal(diagnostics.some(diagnostic => diagnostic.code === "CSHARP_JS_SOURCE_PROFILE_OPERATION_UNSUPPORTED" &&
    diagnostic.message === "Proxy traps redefine object operations dynamically and have no closed C# source-to-source representation."), true,
  "exact constructor diagnostic transport");
  assert.equal(diagnostics.some(diagnostic => diagnostic.code === "CSHARP_UNSUPPORTED_AST" &&
    diagnostic.message === "Expression is outside the current C# planning surface."), true, "the existing independent native refusal is retained");
  const tagged = diagnostics.find(diagnostic => diagnostic.code === "CSHARP_UNSUPPORTED_AST");
  assert.equal(compiled.source.ast.is.IsTaggedTemplateExpression(tagged.sourceNode), true,
    "the independent refusal belongs to the actual tagged template, not an unrelated tag-body operation");
});

test("general native JSON declarations propagate through exact native inheritance without runtime origins", () => {
  const base = Object.freeze({ targetType: { kind: "target-named", id: "Example.JsonBase", csharpAllowsRefLikeTypeArguments: [] }, members: [] });
  const derived = Object.freeze({ targetType: { kind: "target-named", id: "Example.JsonDerived", csharpAllowsRefLikeTypeArguments: [] },
    members: [], implements: [base.targetType] });
  const shapes = new Map([base, derived].map(shape => [targetTypeRefKey(shape.targetType), shape]));
  const engine = createCsharpObjectShapeDemandEngine({ ast: {}, names: { typeParameterNames: [] },
    captureStorage: { captureFrameShape: { get() {} } }, conversions: { conversion: { get() {} } },
    objectShapes: { targetShapes: Object.freeze(Object.fromEntries(shapes)), knownShapes: () => [...shapes.values()],
      resolveTarget(type) { return type === undefined ? undefined : shapes.get(targetTypeRefKey(type)); } } });
  for (const shape of [base, derived]) assert.equal(engine.registerObjectShape(shape, "synthetic").kind, "accepted",
    "the exact native declarations are admitted before serializer publication");
  engine.registerGeneralJsonWriter(base);
  const closure = engine.close();
  for (const shape of [base, derived]) assert.equal(closure.artifacts.find(artifact => artifact.key === objectShapeArtifactKey(shape)).jsonContract?.kind,
    "properties", "a native implementation keeps the declared inherited JSON protocol without a caller census");
  assert.equal(closure.artifacts.length, 2, "no extra representation or source-origin artifact is introduced");
});

test("general native JSON metadata cannot make legal pointer fields acquire an invalid object-boxing writer", () => {
  const pointer = { kind: "pointer", pointee: { kind: "source-primitive", name: "uint8" } };
  const shape = Object.freeze({ targetType: { kind: "target-named", id: "Example.NativeAddress", csharpAllowsRefLikeTypeArguments: [] },
    members: [{ sourceKey: { kind: "property", name: "address" }, sourceName: "address", targetName: "address", memberKind: "property", type: pointer }] });
  const engine = createCsharpObjectShapeDemandEngine({ ast: {}, names: { typeParameterNames: [] },
    captureStorage: { captureFrameShape: { get() {} } }, conversions: { conversion: { get() {} } },
    objectShapes: { targetShapes: Object.freeze({ [targetTypeRefKey(shape.targetType)]: shape }),
      resolveTarget(type) { return type === shape.targetType ? shape : undefined; } } });
  assert.equal(engine.registerObjectShape(shape, "synthetic").kind, "accepted", "the original native pointer field remains representable");
  engine.registerGeneralJsonWriter(shape);
  const artifact = engine.close().artifacts.find(entry => entry.key === objectShapeArtifactKey(shape));
  assert.equal(artifact.fact === shape && artifact.fact.members[0].type === pointer, true, "native pointer identity and storage are unchanged");
  assert.equal(artifact.jsonContract === undefined && !artifact.capabilities.includes("json-serialization"), true,
    "no pointer-to-object conversion, wrapper or false native writer is manufactured");
});
