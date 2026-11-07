// Binding projections and array binding carriers (nextgen C-2542, I2, I6).
// The binding owner's carrier is the represented Host value of the owner (types.value -> facts.values.type); an
// iteration binding needs the Host iteration selection (facts.selections.iteration); object rest bindings read the
// object-shape registry. The former reconciliation of an authored carrier with a checker-selected one
// (reconcileCsharpSelectedTargetType / retainCsharpBroadValueCarrier, policy/types/resolution/selected-type-evidence)
// was a dual path and is deleted: every read has exactly one carrier, the representation of its Host descriptor.
import assert from "node:assert/strict";
import test from "node:test";
import { csharpArrayBindingProjectionTarget, resolveCsharpArrayBindingCarrier } from "../../../dist/policy/types/collections/binding-array-carrier.js";
import { csharpJsArrayTargetType, csharpReadOnlyListTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/policy/types/index.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { conversionIsImplicitlyApplicable } from "../../../dist/policy/conversions/core.js";
import { createCsharpBindingProjectionPolicy } from "../../../dist/analysis/control-flow/binding-projections.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { hostProgram, representationServices, representations } from "../../representation/host-fixture.mjs";

const int32 = csharpSourcePrimitiveTargetType("int32");
const string = csharpStringTargetType();

test("tuple rest projections freeze their owned slices without freezing borrowed source metadata", () => {
  const tuple = { kind: "tuple", elements: [int32, string] };
  const sourceElements = tuple.elements;
  const carrier = resolveCsharpArrayBindingCarrier(tuple);
  const rest = csharpArrayBindingProjectionTarget(carrier, 1, true);
  const empty = csharpArrayBindingProjectionTarget(carrier, 2, true);
  assert.equal(carrier === tuple && tuple.elements === sourceElements, true, "the source tuple is retained by identity");
  assert.equal([rest, empty].every(slice => Object.isFrozen(slice) && Object.isFrozen(slice.elements)), true,
    "both nonempty and empty rest slices own frozen containers");
  assert.equal(Reflect.set(rest.elements, 0, int32) || Reflect.set(empty.elements, 0, string), false,
    "writes to both owned rest slices are refused");
  assert.equal(rest.elements.length === 1 && rest.elements[0] === string && empty.elements.length === 0, true,
    "refused mutations preserve exact canonical elements");
  assert.equal(csharpArrayBindingProjectionTarget(carrier, 1, false) === string, true, "ordinary projections keep identity");
  assert.equal(!Object.isFrozen(tuple) && !Object.isFrozen(sourceElements) && sourceElements.length === 2 &&
    sourceElements[0] === int32 && sourceElements[1] === string, true, "borrowed source metadata remains untouched");
});

function checkedBinding(sourceText) {
  const program = hostProgram(sourceText);
  const bindings = program.nodes.filter(node => program.ast.is.IsBindingElement(node));
  const iteration = program.nodes.find(node => program.ast.is.IsForOfStatement(node));
  return { program, ast: program.ast, bindings, iteration };
}

test("object rest projection reads the shape registry for the exact binding and retains its reentrancy guard", () => {
  const { program, ast, bindings } = checkedBinding(`
    export function read({ omitted, ...rest }: { omitted: number; label: string }): string { return rest.label; }
  `);
  const rest = bindings.find(binding => ast.as.AsBindingElement(binding).DotDotDotToken !== undefined);
  assert.equal(rest !== undefined, true, "one authored rest binding");
  assert.notEqual(program.facts.values.type(rest).kind, "refused", "the Host publishes the rest binding's type");
  const targetType = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "Rest" };
  const owner = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "Owner" };
  let calls = 0;
  let policy;
  const host = { ast, facts: program.facts, providers: {}, scopedTargetType: () => undefined,
    types: { value: node => {
      assert.equal(ast.is.IsParameterDeclaration(node), true, "the owner carrier is the represented parameter");
      return owner;
    } },
    projectTypes: () => assert.fail("an object rest binding reads no project heritage"),
    objectShapes: { resolveNode(selected) {
      calls += 1;
      assert.equal(selected === rest, true, "the same original binding is the selection authority");
      assert.equal(arguments.length === 1, true, "no source file or recursion state travels with the query");
      assert.equal(policy.resolveProjection(rest) === undefined, true, "reentrant binding fails closed");
      return { targetType };
    },
    // A selected physical rest carrier resolves to its own shape; the rest binding stores the object-shape copy of the
    // shape, and this fixture's shapes are their own copies.
    resolveTarget: selected => selected === undefined ? undefined : ({ targetType: selected }),
    resolveCopyShape: shape => shape },
  };
  policy = createCsharpBindingProjectionPolicy(host);
  const selected = policy.resolveProjection(rest);
  assert.equal(selected.storageCarrier === targetType && selected.bindingCarrier === targetType, true);
  assert.equal(calls, 1);
  assert.equal(Object.isFrozen(selected), true);
  host.objectShapes.resolveNode = () => undefined;
  assert.equal(policy.resolveProjection(rest) === undefined, true, "missing exact shape has no selected-type fallback");
  const physical = Object.freeze({ ...targetType, id: "PhysicalRest", csharpValueType: true });
  host.scopedTargetType = selected => {
    assert.equal(selected === rest, true, "only the actual rest binding owns its scoped physical storage");
    return physical;
  };
  host.objectShapes.resolveNode = () => assert.fail("selected physical storage is never recomputed from the raw source shape");
  const selectedPhysical = policy.resolveProjection(rest);
  assert.equal(selectedPhysical.storageCarrier === physical && selectedPhysical.bindingCarrier === physical, true,
    "all rest storage and binding consumers retain the exact once-selected native carrier");
});

test("iteration destructuring requires the Host iteration selection and its native element carrier", () => {
  const { program, ast, bindings, iteration } = checkedBinding(`
    export function read(rows: [string, number][]): string {
      for (const [label, value] of rows) { return label + value; }
      return "";
    }
  `);
  const tuple = { kind: "tuple", elements: [string, int32] };
  const iterable = { kind: "array", element: tuple };
  const expression = ast.as.AsForInOrOfStatement(iteration).Expression;
  const published = program.facts.selections.iteration(iteration);
  assert.equal(published !== undefined && !("code" in published), true, "the Host publishes the for-of iteration selection");
  let native = iterable;
  let selection = published;
  const facts = Object.freeze({ ...program.facts, selections: Object.freeze({ ...program.facts.selections, iteration: selected => {
    assert.equal(selected === iteration, true, "exact iteration subject");
    return selection;
  } }) });
  const policy = createCsharpBindingProjectionPolicy({ ast, facts, providers: {}, objectShapes: {},
    scopedTargetType: () => undefined, projectTypes: () => assert.fail("tuple bindings read no project heritage"),
    types: { value(selected) {
      assert.equal(selected === expression, true, "the represented iterable expression owns the element carrier");
      return native;
    } },
  });
  assert.equal(policy.resolveNode(bindings[0]) === string, true);
  assert.equal(policy.resolveNode(bindings[1]) === int32, true, "native integer is not widened by Source number");
  native = { kind: "csharp-refused", code: "CSHARP_FIXTURE", message: "fixture", site: expression };
  assert.equal(policy.resolveNode(bindings[0]) === undefined, true, "a refused iterable has no element carrier");
  native = iterable;
  for (const invalid of [undefined, Object.freeze({ kind: "refused", code: "TSONIC_SOURCE_ITERATION_UNTYPED", message: "fixture", site: iteration })]) {
    selection = invalid;
    assert.equal(policy.resolveNode(bindings[0]) === undefined, true, "no iteration without the Host selection");
  }
});

test("native construction proof does not inherit source payload extraction through nested conversions", () => {
  const wrap = conversion => ({ kind: "implicit", proof: "runtime-union-arm", armIndex: 0,
    armType: string, sourceToArm: { kind: "nullable-map", sourceElement: string, targetElement: string, conversion } });
  assert.equal(conversionIsImplicitlyApplicable(wrap({ kind: "identity" })), true);
  for (const conversion of [{ kind: "js-value-cast" }, { kind: "runtime-union-projection", path: [],
    armType: string, retainsAbsence: false }, { kind: "js-value-box" }, { kind: "rejected", reason: "no native relation" }]) {
    assert.equal(conversionIsImplicitlyApplicable(wrap(conversion)), false);
  }
});

test("every read has one carrier: the representation of its Host descriptor (no authored/selected reconciliation)", () => {
  const program = hostProgram(`import type { int32 } from "@tsonic/core/types.js";
export interface Box<T> { value: T }
export type IntBox = Box<int32>;
export function alias(box: IntBox): IntBox { return box; }
export function broad(value: unknown): unknown { if (value !== undefined && value !== null) { return value; } return undefined; }
export function listed(value: unknown): unknown { if (Array.isArray(value)) { return value; } return undefined; }
export function gone(value: int32): int32 { if (typeof value === "string") { return value; } return value; }
`);
  const represent = representations(representationServices(program));
  const { ast } = program;
  const returned = program.nodes.filter(node => ast.is.IsReturnStatement(node)).map(node => ast.as.AsReturnStatement(node).Expression)
    .filter(node => node !== undefined && ast.is.IsIdentifier(node));
  assert.equal(returned.length >= 5, true, "every returned binding read is exercised");
  for (const read of returned) {
    const outcome = program.facts.values.type(read);
    assert.notEqual(outcome.kind, "refused", `the Host publishes the read ${ast.text(read)}`);
    const viaNode = represent.value(read);
    const viaDescriptor = represent.type(outcome.type, read, "value");
    assert.equal(viaNode.kind === viaDescriptor.kind &&
      (viaNode.kind === "csharp-refused" ? viaNode.code === viaDescriptor.code : targetTypeRefEquals(viaNode, viaDescriptor)), true,
      `${ast.text(read)}: the node-keyed carrier is the represented Host descriptor, nothing else`);
  }
  const box = returned.find(read => ast.text(ast.parent(ast.parent(ast.parent(read)))).includes("function alias("));
  const carrier = represent.value(box);
  assert.equal(carrier.kind === "target-named" && carrier.id === "global::Fixture.Box", true);
  assert.equal(carrier.typeArguments[0].kind === "source-primitive" && carrier.typeArguments[0].name === "int32", true,
    "a closed authored alias keeps its authored int32 argument; nothing re-selects a float64 instance");
});

test("array binding policy preserves raw and JS array rest carriers", () => {
  const rawArray = { kind: "array", element: int32 };
  const raw = resolveCsharpArrayBindingCarrier(rawArray);
  assert.deepEqual(raw, {
    kind: "array",
    carrier: rawArray,
    element: int32,
    lengthMember: "Length",
    restSlice: "runtime-array-helper",
    restCarrier: rawArray,
  });
  assert.deepEqual(csharpArrayBindingProjectionTarget(raw, 0, false), int32);
  assert.deepEqual(csharpArrayBindingProjectionTarget(raw, 1, true), rawArray);

  const jsArray = csharpJsArrayTargetType(string);
  const js = resolveCsharpArrayBindingCarrier(jsArray);
  assert.deepEqual(js, {
    kind: "array",
    carrier: jsArray,
    element: string,
    lengthMember: "length",
    restSlice: "instance-slice",
    restCarrier: jsArray,
  });
  assert.equal(csharpArrayBindingProjectionTarget(js, 0, false), string);
  assert.equal(csharpArrayBindingProjectionTarget(js, 1, true), jsArray);
  for (const element of [int32, csharpSourcePrimitiveTargetType("uint64"), csharpNullableTargetType(int32)]) {
    const dense = resolveCsharpArrayBindingCarrier(csharpJsArrayTargetType(element));
    assert.equal(csharpArrayBindingProjectionTarget(dense, 0, false), element);
  }
  for (const index of [-1, 0.5, Infinity, NaN]) {
    assert.equal(csharpArrayBindingProjectionTarget(js, index, false), undefined);
  }
});

test("array binding policy projects fixed tuple rest as an exact tuple slice", () => {
  const tuple = {
    kind: "tuple",
    elements: [string, int32, int32],
  };
  const carrier = resolveCsharpArrayBindingCarrier(tuple);
  assert.deepEqual(csharpArrayBindingProjectionTarget(carrier, 1, false), int32);
  assert.deepEqual(csharpArrayBindingProjectionTarget(carrier, 1, true), {
    kind: "tuple",
    elements: [int32, int32],
  });
  assert.equal(csharpArrayBindingProjectionTarget(carrier, 4, false), undefined);
});

test("array binding policy states the concrete rest carrier for read-only lists", () => {
  const readOnly = csharpReadOnlyListTargetType(int32);
  const carrier = resolveCsharpArrayBindingCarrier(readOnly);
  assert.equal(carrier?.kind, "array");
  assert.equal(carrier?.lengthMember, "Count");
  assert.equal(carrier?.restSlice, "js-array-helper");
  assert.deepEqual(
    csharpArrayBindingProjectionTarget(carrier, 2, true),
    carrier?.restCarrier,
  );
  assert.equal(carrier?.restCarrier.kind, "target-named");
  assert.equal(carrier?.restCarrier.id, "System.Collections.Generic.List`1");
});

test("array binding policy publishes the dense native list rest frozen around the canonical element", () => {
  for (const [label, element] of [
    ["int32", int32],
    ["nullable int32", csharpNullableTargetType(int32)],
    ["JS array of string", csharpJsArrayTargetType(string)],
  ]) {
    const elementWasFrozen = Object.isFrozen(element);
    const carrier = resolveCsharpArrayBindingCarrier(csharpReadOnlyListTargetType(element));
    const rest = csharpArrayBindingProjectionTarget(carrier, 1, true);
    assert.equal(carrier?.restSlice === "js-array-helper" && rest === carrier.restCarrier, true,
      `${label}: the non-empty rest reads the descriptor's one dense list carrier`);
    assert.equal(rest.id === "System.Collections.Generic.List`1" && rest.csharpCollectionSemantics === "dense", true,
      `${label}: the rest carrier is the native List`);
    const construction = rest.csharpArrayLiteralConstructionType;
    assert.deepEqual([carrier, rest, rest.typeArguments, rest.csharpRender, rest.csharpRender.namespace,
      rest.csharpArrayLiteralBuilder, construction, construction.typeArguments].map(Object.isFrozen),
    [true, true, true, true, true, true, true, true], `${label}: every newly owned list container is frozen`);
    assert.equal(
      Reflect.set(rest.typeArguments, 0, string) ||
        Reflect.set(rest, "csharpCollectionSemantics", "js-array") ||
        Reflect.set(rest.csharpRender.namespace, "length", 0) ||
        Reflect.set(rest.csharpArrayLiteralBuilder, "appendElementMethod", "Push") ||
        Reflect.set(construction, "csharpIndexableLengthMemberName", "length"),
      false,
      `${label}: mutation of the published list carrier is refused`,
    );
    assert.equal(rest.typeArguments.length === 1 && rest.csharpRender.namespace.join(".") === "System.Collections.Generic" &&
      rest.csharpArrayLiteralBuilder.appendElementMethod === "Add" && rest.csharpIndexableLengthMemberName === "Count", true,
    `${label}: the refused writes left the carrier unchanged`);
    assert.equal([rest.typeArguments[0], rest.csharpArrayLiteralElementType, rest.csharpEnumerableElementType,
      rest.csharpReadOnlyIndexableElementType, rest.csharpDenseMutableElementType, construction.typeArguments[0]]
      .every(type => type === element), true, `${label}: every element slot is the canonical source element`);
    assert.equal(Object.isFrozen(element), elementWasFrozen, `${label}: the source element is not copied or frozen`);
  }
});
