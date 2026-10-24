import assert from "node:assert/strict";
import test from "node:test";
import { resolvedTargetStage, runTargetCompilationStages } from "@tsonic/target-api/artifacts";
import { compileCsharpRequiredRecordSource } from "../../../helpers/required-records.mjs";
import { createCsharpPlanningContext } from "../../../../dist/backend/planner/context.js";
import { createDestructuringPlannerState } from "../../../../dist/backend/planner/bindings/binding-state.js";
import { csharpTypeFromTargetTypeRefWithObjectShapeDeclarations } from "../../../../dist/backend/planner/types/target-type-object-shapes.js";
import { getCsharpTypeForNode } from "../../../../dist/backend/planner/types/type-node.js";
import { planValueTypeDeclaration } from "../../../../dist/backend/planner/declarations/value-types.js";
import { planParametersWithPrelude } from "../../../../dist/backend/planner/declarations/callables/parameters.js";
import { planCsharpRuntimeParameterDefault } from "../../../../dist/backend/planner/declarations/callables/defaults.js";
import { planCsharpPreparedConstructor } from "../../../../dist/backend/planner/declarations/classes/constructor-entry.js";
import { planLambdaParameterStorage } from "../../../../dist/backend/planner/expressions/lambda-parameter-storage.js";
import { analyzeCsharpTypeEmission } from "../../../../dist/analysis/source-evidence/types/emission.js";
import { csharpRuntimeUnionTargetType, csharpEmptyObjectTargetType, csharpTsValueTargetType } from "../../../../dist/target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../../dist/target-model/types/equality.js";

// Rendering a native type is guarded by the sealed type-emission record of that exact carrier: the analysis walks the
// rendered carrier (type arguments, elements, pointees, function-pointer signatures, method owners and genuine union
// payloads) and publishes the object-shape declarations it depends on; the planner reads only that record.

const integer = { kind: "source-primitive", name: "int32" };
const missingRecord = "An admitted native type requires its sealed artifact dependency set.";
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
  const defaultContract = program.records.runtimeDefault.get(defaultParameter);
  const defaultShape = program.objectShapes.resolveTarget(defaultContract?.valueType);
  assert.equal(parameter !== undefined && defaultParameter !== undefined && declaration !== undefined && constructor !== undefined && shape !== undefined, true,
    "all actual checked caller subjects and the published native shape exist");
  assert.equal(storageParameter !== undefined && storageShape !== undefined && defaultShape !== undefined, true,
    "the required storage and runtime-default callers retain their own published shape identities");
  return { ...cached, parameter, defaultParameter, defaultContract, declaration, constructor, shape, storageParameter, storageShape, defaultShape };
}

// The planning context of the real sealed program with the type-emission record of one carrier removed.
function contextWithoutTypeEmission({ program }, carrier, patch = {}) {
  assert.equal(program.records.typeEmission.get(carrier) !== undefined, true, "the removed record was genuinely published");
  const typeEmission = Object.freeze({ get: type => targetTypeRefEquals(type, carrier) ? undefined : program.records.typeEmission.get(type) });
  return createCsharpPlanningContext(Object.freeze({ ...program, records: Object.freeze({ ...program.records, ...patch, typeEmission }) }));
}

function rejectsBeforeOutput(input, invoke, label) {
  let materialized = false;
  const output = runTargetCompilationStages({
    analyze: () => resolvedTargetStage(input.program),
    plan: () => resolvedTargetStage(invoke(input)),
    materialize: () => { materialized = true; return { artifacts: [] }; },
  });
  assert.equal(output.kind, "rejected", `${label}: a missing sealed type-emission record is rejected at the planner boundary`);
  assert.equal(output.diagnostics.length, 1, `${label}: one canonical invariant diagnostic`);
  assert.equal(output.diagnostics[0].code, "TSONIC_INTERNAL_PLANNER_INVARIANT", `${label}: not a source refusal or Roslyn error`);
  assert.equal(output.diagnostics[0].message, missingRecord, label);
  assert.equal(materialized, false, `${label}: no output is published`);
}

// The analysis's type-emission record of one carrier against the program's final object-shape index.
function emissionFor(targetShapes, carrier) {
  const analysis = analyzeCsharpTypeEmission({ ast: { parent: () => undefined }, nodes: [], languageDialect: "csharp14", extraTypes: [carrier],
    evidence: { targetTypes: [], typeParameterConstraints: { get: () => undefined } },
    values: { valueRead: { get: () => undefined } }, storage: { storageType: { get: () => undefined } },
    shapes: { targetShapes }, admitted: () => false });
  const record = analysis.records.typeEmission.get(carrier);
  assert.equal(record !== undefined, true, `${targetTypeRefKey(carrier)}: the analysis publishes the rendered carrier`);
  return record;
}

const dependsOn = (record, fact) => record.objectShapes.some(selected => targetTypeRefEquals(selected.targetType, fact.targetType));

test("all seven production caller positions retain the single sealed type-emission guard", () => {
  const selected = fixture();
  const { program, source, parameter, defaultParameter, defaultContract, declaration, constructor, shape, storageParameter, storageShape, defaultShape } = selected;
  const file = source.ast.getSourceFile(parameter);
  const state = () => createDestructuringPlannerState(undefined, source.ast);
  const emptyParameters = { parameters: [], prelude: [], entryBindings: [] };
  const packet = { constructorArgument: { get: node => node === parameter ? { kind: "packet", carrier: shape.targetType }
    : program.records.constructorArgument.get(node) } };
  const cases = [
    ["node type resolution", shape.targetType, {}, input => getCsharpTypeForNode(parameter, file, input, undefined, [])],
    ["native value field", shape.targetType, { nativeValueDeclaration: { get: node => node === declaration ? { fields: [{ carrier: shape.targetType,
      source: { sourceType: parameter, sourceName: "count", readonly: false } }] } : program.records.nativeValueDeclaration.get(node) } },
    input => planValueTypeDeclaration(declaration, file, input, [])],
    ["required parameter storage", storageShape.targetType, {}, input => planParametersWithPrelude([storageParameter], file, input, [], state())],
    ["runtime default value carrier", defaultShape.targetType, {}, input => planCsharpRuntimeParameterDefault(defaultParameter, "incoming", file, input, [], state())],
    ["runtime default incoming carrier", defaultContract.native.source, { runtimeDefault: { get: node => {
      const original = program.records.runtimeDefault.get(node);
      return node === defaultParameter ? { ...original, valueType: integer } : original;
    } } }, input => planCsharpRuntimeParameterDefault(defaultParameter, "incoming", file, input, [], state())],
    ["prepared constructor argument", shape.targetType, packet, input => planCsharpPreparedConstructor(constructor,
      source.ast.as.AsConstructorDeclaration(constructor)?.Body, { kind: "ConstructorDeclaration", name: "Derived", modifiers: ["public"], parameters: [] },
      emptyParameters, [{ node: parameter, expectedCarrier: shape.targetType, value: { prelude: [], completion: {
        kind: "value", carrier: shape.targetType, expression: { kind: "IdentifierName", name: "incoming" },
      } } }], file, input, [], state(), true, [])],
    ["lambda parameter native storage", storageShape.targetType, {},
    input => planLambdaParameterStorage([storageParameter], [{ kind: "Parameter", name: "incoming" }], file, input, [], state())],
  ];
  assert.equal(cases.length, 7, "seven call expressions, not the wrapper definition");
  for (const [name, carrier, patch, invoke] of cases) rejectsBeforeOutput(contextWithoutTypeEmission(selected, carrier, patch), invoke, name);
  const positive = createCsharpPlanningContext(program);
  assert.equal(csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(positive, shape.targetType)?.kind, "IdentifierName", "positive twin renders with its actual published record");
  assert.equal(dependsOn(program.records.typeEmission.get(shape.targetType), shape), true, "the sealed record names the shape declaration it renders");
});

test("only rendered containers, real union payloads and physical method owners are dependencies", () => {
  const { program, shape } = fixture();
  const targetShapes = program.records.objectShapeArtifact.targetShapes;
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
  for (const [name, wrapCarrier] of wrap) assert.equal(dependsOn(emissionFor(targetShapes, wrapCarrier(shape.targetType)), shape), true,
    `${name}: the rendered container depends on the shape declaration`);
  const nonrendered = { kind: "type-parameter", identity: "NativeT", name: "NativeT", csharpConstraints: {
    kind: "resolved", constraints: [{ kind: "type", type: shape.targetType }],
  } };
  assert.equal(dependsOn(emissionFor(targetShapes, nonrendered), shape), false, "an unrendered constraint is not a declaration dependency of this name");
  for (const carrier of [integer, csharpTsValueTargetType(), csharpEmptyObjectTargetType()]) {
    assert.equal(emissionFor(targetShapes, carrier).objectShapes.length, 0, "ordinary native, JsValue and EmptyObject have no synthetic artifact dependency");
  }
  const emptyShape = { targetType: csharpEmptyObjectTargetType(), members: [] };
  const exclusions = Object.freeze({ ...targetShapes, [targetTypeRefKey(emptyShape.targetType)]: emptyShape });
  assert.equal(emissionFor(exclusions, emptyShape.targetType).objectShapes.length, 0,
    "a genuinely resolved EmptyObject fact is still excluded from synthetic artifact dependencies");
  assert.equal(emissionFor(exclusions, csharpTsValueTargetType()).objectShapes.length, 0,
    "the actual runtime JsValue remains a native scalar, not a fabricated source object shape");
});

test("rendered type guards read only the sealed type-emission record", () => {
  const selected = fixture();
  const { program, shape } = selected;
  const records = Object.freeze({ ...program.records, objectShapeArtifact: new Proxy(program.records.objectShapeArtifact, {
    get() { assert.fail("rendering a type cannot consult the object-shape index; its sealed record already names the dependencies"); },
  }) });
  const input = createCsharpPlanningContext(Object.freeze({ ...program, records }));
  assert.equal(csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, shape.targetType) !== undefined, true,
    "an admitted shape renders from its sealed type-emission record alone");
  rejectsBeforeOutput(contextWithoutTypeEmission(selected, shape.targetType),
    context => csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(context, shape.targetType), "a missing record is a planner invariant, not a fallback");
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
  const targetShapes = selected.program.records.objectShapeArtifact.targetShapes;
  const union = csharpRuntimeUnionTargetType([integer, outer.targetType], [undefined, outer]);
  const record = emissionFor(targetShapes, union);
  assert.equal(dependsOn(record, outer) && dependsOn(record, nested), true, "a genuine union payload depends on its nested declaration");
  const ordinary = { kind: "target-named", id: "NotAUnion", csharpAllowsRefLikeTypeArguments: [],
    csharpRender: { kind: "named", name: "Ordinary" }, csharpRuntimeUnionObjectShapes: [nested] };
  assert.equal(dependsOn(emissionFor(targetShapes, ordinary), nested), false,
    "an attached fact without a genuine admitted union carrier is not a rendered dependency");
});

test("recursive native payload evidence is recorded once", () => {
  const selected = compileCsharpRequiredRecordSource(`import type { int32 } from "@tsonic/core/types.js";
    interface Link { count: int32; next: Link | null; }
    export function read(value: Link): int32 { return value.count; }`);
  const parameter = selected.nodes.find(node => selected.source.ast.is.IsParameterDeclaration(node));
  const parameterType = selected.source.ast.as.AsParameterDeclaration(parameter)?.Type;
  assert.equal(parameterType !== undefined, true, "the recursive payload parameter retains its authored type");
  const carrier = selected.program.records.nodeTargetType.get(parameterType);
  const shape = selected.program.objectShapes.resolveTarget(carrier);
  assert.equal(shape !== undefined, true, "actual recursive native payload shape");
  const union = csharpRuntimeUnionTargetType([integer, carrier], [undefined, shape]);
  const record = emissionFor(selected.program.records.objectShapeArtifact.targetShapes, union);
  assert.equal(record.objectShapes.filter(fact => targetTypeRefEquals(fact.targetType, shape.targetType)).length, 1,
    "the same recursive declaration is a dependency exactly once");
  assert.equal(csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(createCsharpPlanningContext(selected.program), carrier) !== undefined, true,
    "a legal recursive payload is renderable");
});
