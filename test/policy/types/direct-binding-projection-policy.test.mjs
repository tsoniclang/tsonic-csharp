import assert from "node:assert/strict";
import test from "node:test";
import { csharpArrayBindingProjectionTarget, resolveCsharpArrayBindingCarrier } from "../../../dist/policy/types/collections/binding-array-carrier.js";
import { csharpJsArrayTargetType, csharpReadOnlyListTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType, reconcileCsharpSelectedTargetType } from "../../../dist/policy/types/index.js";
import { csharpEmptyObjectTargetType, csharpTsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { retainCsharpBroadValueCarrier } from "../../../dist/policy/types/resolution/selected-type-evidence.js";
import { csharpNullableReferenceTargetType, csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { conversionIsImplicitlyApplicable } from "../../../dist/policy/conversions/core.js";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { createCsharpBindingProjectionPolicy } from "../../../dist/analysis/control-flow/binding-projections.js";

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
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/project",
    files: { "/project/index.ts": sourceText },
    compilerOptions: { strict: true, target: "es2022", module: "esnext" },
  }).checkSource();
  assert.equal(checked.diagnostics.length, 0, "valid source binding");
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/project/index.ts");
  const bindings = [];
  let iteration;
  const visit = node => {
    if (source.ast.is.IsBindingElement(node)) bindings.push(node);
    if (source.ast.is.IsForOfStatement(node)) iteration = node;
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  return { source, file, bindings, iteration };
}

test("object rest projection consumes exact checked binding identity and retains recursion state", () => {
  const { source, file, bindings } = checkedBinding(`
    export function read({ omitted, ...rest }: { omitted: number; label: string }): string { return rest.label; }
  `);
  const rest = bindings.find(binding => source.ast.as.AsBindingElement(binding).DotDotDotToken !== undefined);
  assert.equal(rest !== undefined, true, "one authored rest binding");
  const type = source.semantics.forFile(file).declarations.declaredValueType(rest);
  assert.equal(type !== undefined, true, "exact checked rest type");
  const targetType = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "Rest" };
  const subject = {};
  const state = { depth: 2, sourceStorageSubject: subject };
  let calls = 0;
  let policy;
  const host = { ast: source.ast, navigation: {}, typeResolver: { resolveNode: () => undefined },
    scopedTargetType: () => undefined,
    semantics: selected => source.semantics.forFile(selected),
    objectShapes: { resolveTypeWithState(selected, selectedFile, syntax, selectedState) {
      calls += 1;
      assert.equal(selected === type, true, "declared binding authority");
      assert.equal(selectedFile === file, true, "owning checker/file");
      assert.equal(syntax === undefined, true, "no invented authored type syntax");
      assert.equal(selectedState.depth, 3, "existing recursive budget advances");
      assert.equal(selectedState.sourceStorageSubject === subject, true, "retained selection context");
      assert.equal(policy.resolveProjection(rest, file, state) === undefined, true, "reentrant binding fails closed");
      return { targetType };
    },
    // A selected physical rest carrier resolves to its own shape; the rest binding stores the object-shape copy of the
    // shape, and this fixture's shapes are their own copies.
    resolveTarget: selected => ({ targetType: selected }),
    resolveCopyShape: shape => shape },
  };
  policy = createCsharpBindingProjectionPolicy(host);
  const selected = policy.resolveProjection(rest, file, state);
  assert.equal(selected.storageCarrier === targetType && selected.bindingCarrier === targetType, true);
  assert.equal(calls, 1);
  assert.equal(Object.isFrozen(selected), true);
  host.objectShapes.resolveTypeWithState = () => undefined;
  assert.equal(policy.resolveProjection(rest, file, state) === undefined, true, "missing exact shape has no selected-type fallback");
  const physical = Object.freeze({ ...targetType, id: "PhysicalRest", csharpValueType: true });
  host.scopedTargetType = selected => {
    assert.equal(selected === rest, true, "only the actual checked rest binding owns its scoped physical storage");
    return physical;
  };
  host.objectShapes.resolveTypeWithState = () => assert.fail("selected physical storage is never recomputed from the raw source shape");
  const selectedPhysical = policy.resolveProjection(rest, file, state);
  assert.equal(selectedPhysical.storageCarrier === physical && selectedPhysical.bindingCarrier === physical, true,
    "all rest storage and binding consumers retain the exact once-selected native carrier");
});

test("iteration destructuring requires checked iteration evidence and its native element carrier", () => {
  const { source, file, bindings, iteration } = checkedBinding(`
    export function read(rows: [string, number][]): string {
      for (const [label, value] of rows) { return label + value; }
      return "";
    }
  `);
  const tuple = { kind: "tuple", elements: [string, int32] };
  const iterable = { kind: "array", element: tuple };
  const expression = source.ast.as.AsForInOrOfStatement(iteration).Expression;
  const semantics = source.semantics.forFile(file);
  const selectedIteration = semantics.operations.iteration(iteration);
  assert.equal(selectedIteration?.iterationKind, "for-of");
  let native = iterable;
  let evidence = selectedIteration;
  const state = { depth: 2 };
  const policy = createCsharpBindingProjectionPolicy({ ast: source.ast, navigation: {}, objectShapes: {},
    scopedTargetType: () => undefined,
    semantics: selected => {
      assert.equal(selected === file, true, "owning source file");
      return { ...semantics, operations: { ...semantics.operations, iteration: selected => {
        assert.equal(selected === iteration, true, "exact iteration subject");
        return evidence;
      } } };
    },
    typeResolver: { resolveNode(selected, selectedFile, selectedState) {
      assert.equal(selected === expression && selectedFile === file, true, "existing native iterable owner");
      assert.equal(selectedState.depth, 3);
      return native;
    } },
  });
  assert.equal(policy.resolveNode(bindings[0], file, state) === string, true);
  assert.equal(policy.resolveNode(bindings[1], file, state) === int32, true, "native integer is not widened by checker number");
  native = undefined;
  assert.equal(policy.resolveNode(bindings[0], file, state) === undefined, true, "missing native element fails closed");
  native = iterable;
  for (const invalid of [undefined, { ...selectedIteration, iterationKind: "for-in" }]) {
    evidence = invalid;
    assert.equal(policy.resolveNode(bindings[0], file, state) === undefined, true, "no unchecked iteration fallback");
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

test("flow-unreachable reads retain their declared carrier without changing genuine never expressions", () => {
  const never = { kind: "opaque", id: "never" };
  for (const stored of [int32, string, csharpTsValueTargetType()]) {
    assert.equal(reconcileCsharpSelectedTargetType(stored, never, "unrelated", false), stored);
  }
  assert.equal(reconcileCsharpSelectedTargetType(undefined, never, "unrelated", false), never);
  assert.equal(reconcileCsharpSelectedTargetType(never, never, "identical", false), never);
});

test("non-nullish broad values do not become empty object identities", () => {
  const broad = csharpTsValueTargetType();
  const empty = csharpEmptyObjectTargetType();
  assert.equal(retainCsharpBroadValueCarrier(broad, empty, false), broad);
  assert.equal(reconcileCsharpSelectedTargetType(broad, empty, "unrelated", false), broad);
  const optionalEmpty = csharpNullableReferenceTargetType(empty);
  assert.equal(retainCsharpBroadValueCarrier(broad, optionalEmpty, false), broad);
  assert.equal(reconcileCsharpSelectedTargetType(broad, optionalEmpty, "unrelated", false), broad);
  for (const selected of [int32, string, { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "source.Record", csharpSourceDeclarationKind: "class" }]) {
    assert.equal(retainCsharpBroadValueCarrier(broad, selected, false), undefined);
    assert.equal(reconcileCsharpSelectedTargetType(broad, selected, "unrelated", false), selected);
  }
  assert.equal(retainCsharpBroadValueCarrier(empty, broad, false), undefined);
  assert.equal(retainCsharpBroadValueCarrier(empty, empty, false), undefined);
  assert.equal(retainCsharpBroadValueCarrier(undefined, empty, false), undefined);
  assert.equal(retainCsharpBroadValueCarrier(broad, undefined, false), undefined);
});

test("array category narrowing does not invent the erased backing's native element layout", () => {
  const broad = csharpTsValueTargetType();
  for (const selected of [{ kind: "array", element: broad }, { kind: "array", element: string },
    { kind: "tuple", elements: [string, int32] }, csharpJsArrayTargetType(broad), csharpJsArrayTargetType(string)]) {
    assert.equal(retainCsharpBroadValueCarrier(broad, selected, false), broad);
    assert.equal(reconcileCsharpSelectedTargetType(broad, selected, "unrelated", false), broad);
    const optional = csharpNullableReferenceTargetType(selected);
    assert.equal(retainCsharpBroadValueCarrier(broad, optional, false), broad);
    assert.equal(retainCsharpBroadValueCarrier(string, selected, false), undefined);
  }
  const typed = csharpJsArrayTargetType(string);
  assert.equal(retainCsharpBroadValueCarrier(typed, csharpJsArrayTargetType(broad), false), undefined);
  assert.equal(retainCsharpBroadValueCarrier(broad, csharpReadOnlyListTargetType(string), false), undefined);
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

test("selected type reconciliation preserves closed authored aliases only for the same source declaration", () => {
  const authored = {
    kind: "target-named", csharpAllowsRefLikeTypeArguments: [false],
    id: "Example.Box`1",
    typeArguments: [int32],
  };
  const erased = {
    kind: "target-named", csharpAllowsRefLikeTypeArguments: [false],
    id: "Example.Box`1",
    typeArguments: [csharpSourcePrimitiveTargetType("float64")],
  };
  const open = {
    kind: "target-named", csharpAllowsRefLikeTypeArguments: [false],
    id: "Example.Box`1",
    typeArguments: [{ kind: "type-parameter", identity: "T", name: "T" }],
  };

  assert.strictEqual(
    reconcileCsharpSelectedTargetType(authored, erased, "same-declaration", false),
    authored,
  );
  assert.strictEqual(
    reconcileCsharpSelectedTargetType(open, erased, "same-declaration", false),
    erased,
  );
  assert.strictEqual(
    reconcileCsharpSelectedTargetType(authored, erased, "unrelated", false),
    erased,
  );
});
