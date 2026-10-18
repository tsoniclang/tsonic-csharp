import assert from "node:assert/strict";
import test from "node:test";
import { resolvedTargetStage, runTargetCompilationStages } from "@tsonic/target-api/artifacts";
import { compileCsharpRequiredRecordSource } from "../../../helpers/required-records.mjs";
import { createCsharpPlanningContext } from "../../../../dist/backend/planner/context.js";
import { createDestructuringPlannerState } from "../../../../dist/backend/planner/bindings/binding-state.js";
import { csharpTypeFromTargetTypeRefWithObjectShapeDeclarations } from "../../../../dist/backend/planner/types/target-type-object-shapes.js";
import { getCsharpTypeForNode } from "../../../../dist/backend/planner/types/type-node/resolution.js";
import { planValueTypeDeclaration } from "../../../../dist/backend/planner/declarations/value-types.js";
import { planParametersWithPrelude } from "../../../../dist/backend/planner/declarations/callables/parameters.js";
import { planCsharpRuntimeParameterDefault } from "../../../../dist/backend/planner/declarations/callables/defaults.js";
import { planCsharpPreparedConstructor } from "../../../../dist/backend/planner/declarations/classes/constructor-entry.js";
import { planLambdaParameterStorage } from "../../../../dist/backend/planner/expressions/lambda-parameter-storage.js";
import { csharpRuntimeUnionTargetType, csharpEmptyObjectTargetType, csharpTsValueTargetType } from "../../../../dist/target-model/types/carriers/runtime-carriers.js";
import { objectShapeArtifactKey } from "../../../../dist/target-model/records/object-shape-demand.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../../dist/target-model/types/equality.js";

const integer = { kind: "source-primitive", name: "int32" };
const sourceText = `import type { int32 } from "@tsonic/core/types.js";
export const seed = { count: 3 as int32 };
export function read(value: { count: int32 }): int32 { return value.count; }
export function defaulted(value: { count: int32 } = { count: 2 as int32 }): int32 { return value.count; }
class Base { constructor(value: { count: int32 }) {} }
export class Derived extends Base { constructor(value: { count: int32 }) { super(value); } }
class NativePayload { count: int32 = 3; }
export function adapted(input: NativePayload): int32 {
  const read: (value: NativePayload) => int32 = (value: { count: int32 }) => value.count;
  return read(input);
}
`;
let cached;
function fixture() {
  cached ??= compileCsharpRequiredRecordSource(sourceText);
  const { program, source, nodes } = cached;
  const parameter = nodes.find(node => source.ast.is.IsParameterDeclaration(node) && source.ast.text(source.ast.name(source.ast.parent(node))) === "read");
  const defaultParameter = nodes.find(node => source.ast.is.IsParameterDeclaration(node) && source.ast.as.AsParameterDeclaration(node)?.Initializer !== undefined);
  const declaration = nodes.find(node => source.ast.is.IsVariableDeclaration(node) && source.ast.text(source.ast.name(node)) === "seed");
  const constructor = nodes.find(node => source.ast.is.IsConstructorDeclaration(node) && source.ast.text(source.ast.name(source.ast.parent(node))) === "Derived");
  const parameterType = source.ast.as.AsParameterDeclaration(parameter)?.Type;
  assert.equal(parameterType !== undefined, true, "the checked ordinary parameter retains its authored type");
  const shape = program.objectShapes.resolveTarget(program.records.nodeTargetType.get(parameterType));
  const storageParameter = nodes.find(node => source.ast.is.IsParameterDeclaration(node) && source.ast.is.IsArrowFunction(source.ast.parent(node)));
  const nativeStorageType = program.records.lambdaParameterType.get(storageParameter);
  const storageType = program.records.requiredStorageType.get(storageParameter);
  assert.equal(nativeStorageType !== undefined && storageType !== undefined && !targetTypeRefEquals(nativeStorageType, storageType), true,
    "the real contextual lambda retains distinct native incoming and required source storage carriers");
  const storageShape = program.objectShapes.resolveTarget(storageType);
  const defaultShape = program.objectShapes.resolveTarget(program.records.runtimeDefault.get(defaultParameter)?.valueType);
  assert.equal(parameter !== undefined && defaultParameter !== undefined && declaration !== undefined && constructor !== undefined && shape !== undefined, true,
    "all actual checked caller subjects and the published native shape exist");
  assert.equal(storageParameter !== undefined && storageShape !== undefined && defaultShape !== undefined, true,
    "the required storage and runtime-default callers retain their own published shape identities");
  return { ...cached, parameter, defaultParameter, declaration, constructor, shape, storageParameter, storageShape, defaultShape };
}

function contextWithMissingArtifact(fixture, patch = {}) {
  const { program, shape } = fixture;
  const demand = program.records.objectShapeArtifact;
  const selected = demand.get(objectShapeArtifactKey(shape));
  assert.equal(selected !== undefined, true, "the removed artifact was genuinely enrolled and published");
  const missing = Object.freeze({ ...demand, artifacts: Object.freeze(demand.artifacts.filter(artifact => artifact.key !== selected.key)),
    get: key => key === selected.key ? undefined : demand.get(key) });
  const records = Object.freeze({ ...program.records, ...patch, objectShapeArtifact: missing });
  return createCsharpPlanningContext(Object.freeze({ ...program, records }));
}

function rejectsBeforeOutput(input, invoke, label) {
  let materialized = false;
  const output = runTargetCompilationStages({
    analyze: () => resolvedTargetStage(input.program),
    plan: () => resolvedTargetStage(invoke(input)),
    materialize: () => { materialized = true; return { artifacts: [] }; },
  });
  assert.equal(output.kind, "rejected", `${label}: a sealed shape miss is rejected at the planner boundary`);
  assert.equal(output.diagnostics.length, 1, `${label}: one canonical invariant diagnostic`);
  assert.equal(output.diagnostics[0].code, "TSONIC_INTERNAL_PLANNER_INVARIANT", `${label}: not a source refusal or Roslyn error`);
  assert.equal(output.diagnostics[0].message, "An admitted native shape requires its sealed artifact record.", label);
  assert.equal(materialized, false, `${label}: no output is published`);
}

test("all seven production caller positions retain the single sealed declaration guard", () => {
  const selected = fixture();
  const { program, source, parameter, defaultParameter, declaration, constructor, shape, storageParameter, storageShape, defaultShape } = selected;
  const file = source.ast.getSourceFile(parameter);
  const state = () => createDestructuringPlannerState(undefined, source.ast);
  const emptyParameters = { parameters: [], prelude: [], entryBindings: [] };
  const cases = [
    ["node type resolution", shape, {}, input => getCsharpTypeForNode(parameter, file, input, undefined, [])],
    ["native value field", shape, { nativeValueDeclaration: { get: node => node === declaration ? { fields: [{ carrier: shape.targetType,
      source: { sourceType: parameter, sourceName: "count", readonly: false } }] } : program.records.nativeValueDeclaration.get(node) } },
    input => planValueTypeDeclaration(declaration, file, input, [])],
    ["required parameter storage", storageShape, {}, input => planParametersWithPrelude(source.ast.parent(storageParameter), file, input, [], state())],
    ["runtime default value carrier", defaultShape, {}, input => planCsharpRuntimeParameterDefault(defaultParameter, "incoming", file, input, [], state())],
    ["runtime default incoming carrier", defaultShape, { runtimeDefault: { get: node => {
      const original = program.records.runtimeDefault.get(node);
      return node === defaultParameter ? { ...original, valueType: integer } : original;
    } } }, input => planCsharpRuntimeParameterDefault(defaultParameter, "incoming", file, input, [], state())],
    ["prepared constructor argument", shape, {}, input => planCsharpPreparedConstructor(constructor,
      source.ast.as.AsConstructorDeclaration(constructor)?.Body, { kind: "ConstructorDeclaration", name: "Derived", modifiers: ["public"], parameters: [] },
      emptyParameters, [{ node: parameter, expectedCarrier: shape.targetType, value: { prelude: [], completion: {
        kind: "value", carrier: shape.targetType, expression: { kind: "IdentifierName", name: "incoming" },
      } } }], file, input, [], state(), true, [])],
    ["lambda parameter native storage", storageShape, {},
    input => planLambdaParameterStorage(source.ast.parent(storageParameter), file, input, [], state(),
      program.records.callableTarget.get(source.ast.parent(storageParameter)))],
  ];
  assert.equal(cases.length, 7, "seven call expressions, not the wrapper definition");
  for (const [name, artifact, patch, invoke] of cases) rejectsBeforeOutput(contextWithMissingArtifact({ ...selected, shape: artifact }, patch), invoke, name);
  assert.equal(program.records.objectShapeArtifact.artifacts.length > 0, true, "the original positive checked compilation is untouched");
  const positive = createCsharpPlanningContext(program);
  assert.equal(csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(positive, shape.targetType)?.kind, "IdentifierName", "positive twin renders with its actual admitted fact");
});

test("only rendered containers, real union payloads and physical method owners are guarded", () => {
  const selected = fixture();
  const { shape } = selected;
  const wrap = [
    ["generic", inner => ({ kind: "target-named", id: "Native.Box", typeArguments: [inner], csharpAllowsRefLikeTypeArguments: [false], csharpRender: { kind: "named", name: "Box", genericArity: 1 } })],
    ["array", inner => ({ kind: "array", element: inner })],
    ["tuple", inner => ({ kind: "tuple", elements: [integer, inner] })],
    ["pointer", inner => ({ kind: "pointer", pointee: inner })],
    ["function pointer input", inner => ({ kind: "function-pointer", args: [inner], result: integer })],
    ["function pointer output", inner => ({ kind: "function-pointer", args: [integer], result: inner })],
    ["actual union arm", inner => csharpRuntimeUnionTargetType([integer, inner], [undefined, shape])],
    ["physical method owner", inner => ({ kind: "target-named", id: "Method", csharpAllowsRefLikeTypeArguments: [], csharpMethodValue: {
      owner: inner, method: "read", identity: "read", contract: integer, typeParameters: [], allowsRefLikeTypeArguments: [],
    } })],
  ];
  for (const [name, wrapCarrier] of wrap) {
    const carrier = wrapCarrier(shape.targetType);
    rejectsBeforeOutput(contextWithMissingArtifact(selected), input => csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, carrier), name);
    assert.equal(csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(createCsharpPlanningContext(selected.program), carrier) !== undefined, true,
      `${name}: exact positive twin`);
  }
  const input = contextWithMissingArtifact(selected);
  const nonrendered = { kind: "type-parameter", identity: "NativeT", name: "NativeT", csharpConstraints: {
    kind: "resolved", constraints: [{ kind: "type", type: shape.targetType }],
  } };
  assert.equal(csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, nonrendered)?.kind, "IdentifierName", "an unrendered constraint is not a declaration dependency of this name");
  const revision = input.artifacts.revision;
  for (const carrier of [integer, csharpTsValueTargetType(), csharpEmptyObjectTargetType()]) {
    assert.equal(csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, carrier) !== undefined, true, "ordinary native, JsValue and EmptyObject have no synthetic artifact requirement");
  }
  const jsShape = { targetType: { ...csharpTsValueTargetType(), csharpJsObjectShape: true }, members: [] };
  const emptyShape = { targetType: csharpEmptyObjectTargetType(), members: [] };
  const targetShapes = Object.freeze({ ...input.program.records.objectShapeArtifact.targetShapes,
    [targetTypeRefKey(jsShape.targetType)]: jsShape, [targetTypeRefKey(emptyShape.targetType)]: emptyShape });
  const exclusions = { ...input, program: { ...input.program, records: { ...input.program.records,
    objectShapeArtifact: { ...input.program.records.objectShapeArtifact, targetShapes },
  } } };
  for (const shape of [jsShape, emptyShape]) assert.equal(csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(exclusions, shape.targetType) !== undefined, true,
    "a genuinely resolved JsValue/EmptyObject fact is still excluded from synthetic artifact requirements");
  assert.equal(input.artifacts.revision, revision, "read-only checks do not register artifacts");
});

test("rendered type guards read the canonical completed shape record without calling analysis", () => {
  const selected = fixture();
  const original = createCsharpPlanningContext(selected.program);
  const demand = selected.program.records.objectShapeArtifact;
  assert.equal(demand.targetShapes === selected.program.objectShapes.targetShapes && Object.isFrozen(demand.targetShapes), true,
    "the backend receives the exact immutable final shape index, including undemanded shapes");
  const input = { ...original, types: { ...original.types, objectShapes: { ...original.types.objectShapes,
    resolveTarget() { assert.fail("a rendered type cannot call the analysis shape resolver"); },
  } } };
  assert.equal(csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, selected.shape.targetType) !== undefined, true,
    "an admitted shape renders using only its canonical lookup and strict artifact record");
  const missing = contextWithMissingArtifact(selected);
  const strict = { ...missing, types: input.types };
  rejectsBeforeOutput(strict, context => csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(context, selected.shape.targetType),
    "a removed artifact stays distinguishable from a nonexistent shape");
  assert.equal(input.artifacts.revision, original.artifacts.revision, "no shape registration or decision is repeated");
});

test("a real union payload requires its nested declaration without treating attached metadata as a union", () => {
  const selected = compileCsharpRequiredRecordSource(`import type { int32 } from "@tsonic/core/types.js";
    export function read(value: { nested: { count: int32 } }): int32 { return value.nested.count; }`);
  const parameter = selected.nodes.find(node => selected.source.ast.is.IsParameterDeclaration(node));
  const parameterType = selected.source.ast.as.AsParameterDeclaration(parameter)?.Type;
  assert.equal(parameterType !== undefined, true, "the nested payload parameter retains its authored type");
  const outer = selected.program.objectShapes.resolveTarget(selected.program.records.nodeTargetType.get(parameterType));
  assert.equal(outer !== undefined, true, "the authored outer payload has its exact published shape");
  const nested = selected.program.objectShapes.resolveTarget(outer.members.find(member => member.sourceName === "nested").type);
  assert.equal(nested !== undefined, true, "the payload contains a real independently published nested shape");
  const input = contextWithMissingArtifact({ ...selected, shape: nested });
  const union = csharpRuntimeUnionTargetType([integer, outer.targetType], [undefined, outer]);
  rejectsBeforeOutput(input, context => csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(context, union), "nested union payload");
  const ordinary = { kind: "target-named", id: "NotAUnion", csharpAllowsRefLikeTypeArguments: [],
    csharpRender: { kind: "named", name: "Ordinary" }, csharpRuntimeUnionObjectShapes: [nested] };
  assert.equal(csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, ordinary)?.kind, "IdentifierName",
    "an attached fact without a genuine admitted union carrier is not a rendered dependency");
});

test("recursive native payload evidence is read once with local revisit accounting", () => {
  const selected = compileCsharpRequiredRecordSource(`import type { int32 } from "@tsonic/core/types.js";
    interface Link { count: int32; next: Link | null; }
    export function read(value: Link): int32 { return value.count; }`);
  const parameter = selected.nodes.find(node => selected.source.ast.is.IsParameterDeclaration(node));
  const parameterType = selected.source.ast.as.AsParameterDeclaration(parameter)?.Type;
  assert.equal(parameterType !== undefined, true, "the recursive payload parameter retains its authored type");
  const carrier = selected.program.records.nodeTargetType.get(parameterType);
  const shape = selected.program.objectShapes.resolveTarget(carrier);
  assert.equal(shape !== undefined, true, "actual recursive native payload shape");
  const original = createCsharpPlanningContext(selected.program);
  const reads = [];
  const input = { ...original, artifacts: { ...original.artifacts, objectShape(fact) {
    reads.push(objectShapeArtifactKey(fact)); return original.artifacts.objectShape(fact);
  } } };
  const union = csharpRuntimeUnionTargetType([integer, carrier], [undefined, shape]);
  assert.equal(csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, union) !== undefined, true, "a legal recursive payload is renderable");
  assert.equal(reads.filter(key => key === objectShapeArtifactKey(shape)).length, 1, "the same recursive declaration is required exactly once");
  assert.equal(input.artifacts.revision, original.artifacts.revision, "cycle handling never mutates published evidence");
});
