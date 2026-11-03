import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpArrayTypeNodeSource } from "../../../dist/analysis/source-evidence/types/resolution/root-sources.js";
import { resolveFormedCsharpArrayTypeNode } from "../../../dist/analysis/source-evidence/types/resolution/nodes.js";
import { bindCsharpSourceStorageContext, formCsharpSourceStorageComponentContext } from "../../../dist/analysis/source-evidence/types/resolution/source-storage-projection.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { getCsharpJsArrayElementTargetType } from "../../../dist/target-model/types/carriers/collections.js";

function fixture(array = true) {
  const unit = { node: {}, elementNode: {}, file: {}, fallbackType: {}, observations: [], children: [],
    elementCarrier: undefined, fallbackCarrier: undefined, target: { surfaces: [] } };
  const previous = { kind: "tuple-element", index: 2 };
  unit.subject = { node: {}, kind: "input", projection: [previous] };
  unit.state = { depth: 6, sourceBindings: new Map(), sourceStorageBindings: {}, sourceStorageSubject: unit.subject,
    rejectNativeResolution: () => assert.fail("these synthetic array leaves have no rejection") };
  unit.queries = { sourceFile: unit.file, types: { authoredType(node) {
    assert.equal(node === unit.node, true);
    unit.observations.push("authored-fallback");
    return unit.fallbackType;
  } } };
  unit.host = { ast: { is: { IsArrayTypeNode(node) {
    assert.equal(node === unit.node, true);
    unit.observations.push("array-node");
    return array;
  } }, as: { AsArrayTypeNode(node) {
    assert.equal(node === unit.node, true);
    unit.observations.push("element-node");
    return { ElementType: unit.elementNode };
  } } }, sourceStorage: { subject(node, kind, projection) {
    assert.equal(node === unit.subject.node && kind === unit.subject.kind, true);
    assert.equal(projection.length === 2 && projection[0] === previous && projection[1].kind === "array-element", true);
    unit.observations.push("element-storage");
    unit.projected = { node, kind, projection };
    return { kind: "resolved", subject: unit.projected };
  } } };
  return unit;
}

function capture(unit) {
  unit.source = formCsharpArrayTypeNodeSource({ host: unit.host }, unit.node, unit.queries, unit.state);
  return unit.source;
}

function forbidSource(unit) {
  unit.host.ast = undefined;
  unit.host.sourceStorage = undefined;
  unit.queries.types.authoredType = () => assert.fail("formed array completion cannot query the fallback Source again");
}

function nativeScope(unit) {
  return { host: { get target() { unit.children.push("target"); return unit.target; } },
    resolveNodeWithState(node, file, state) {
      assert.equal(node === unit.elementNode && file === unit.file && state === unit.source.element.state, true);
      assert.equal(state.depth === unit.state.depth + 1 && state.sourceStorageSubject === unit.projected, true);
      assert.equal(state.sourceBindings === unit.state.sourceBindings && state.sourceStorageBindings === unit.state.sourceStorageBindings &&
        state.rejectNativeResolution === unit.state.rejectNativeResolution, true);
      unit.children.push("element");
      return unit.elementCarrier;
    },
    resolveTypeWithState(type, file, state) {
      assert.equal(type === unit.fallbackType && file === unit.file && state === unit.source.fallback.state, true);
      assert.equal(state.depth === unit.state.depth + 1 && state.sourceStorageSubject === unit.state.sourceStorageSubject, true);
      assert.equal(state.sourceBindings === unit.state.sourceBindings && state.sourceStorageBindings === unit.state.sourceStorageBindings &&
        state.rejectNativeResolution === unit.state.rejectNativeResolution, true);
      unit.children.push("fallback");
      return unit.fallbackCarrier;
    },
  };
}

test("synthetic array Node Source keeps actual children, fallback and H0 before Native work", () => {
  const absent = fixture(false);
  const notArray = capture(absent);
  assert.equal(notArray.kind === "not-array" && notArray.node === absent.node && notArray.queries === absent.queries && notArray.state === absent.state, true);
  assert.deepEqual(absent.observations, ["array-node"]);
  assert.equal(resolveFormedCsharpArrayTypeNode({}, notArray) === undefined, true);

  const unit = fixture();
  const source = capture(unit);
  assert.equal(source.kind === "array" && source.node === unit.node && source.queries === unit.queries && source.state === unit.state, true);
  assert.equal(source.elementNode === unit.elementNode && source.fallbackType === unit.fallbackType, true);
  assert.equal(source.element.node === unit.elementNode && source.element.sourceFile === unit.file, true);
  assert.equal(source.fallback.type === unit.fallbackType && source.fallback.sourceFile === unit.file, true);
  assert.equal(source.storage.inputSubject === unit.subject && source.storage.subject === unit.projected, true);
  assert.equal(source.element.state.sourceStorageSubject === unit.projected && source.fallback.state.sourceStorageSubject === unit.subject, true);
  assert.equal(unit.children.length, 0);
  assert.deepEqual(unit.observations, ["array-node", "element-node", "element-storage", "authored-fallback"]);
});

test("synthetic array Native element keeps C# and JS constructors without completing the fallback", () => {
  for (const surface of ["csharp", "js"]) {
    const unit = fixture();
    unit.target = { surfaces: surface === "js" ? ["js"] : [] };
    const source = capture(unit);
    const element = csharpSourcePrimitiveTargetType("int64");
    unit.elementCarrier = element;
    forbidSource(unit);
    const completed = resolveFormedCsharpArrayTypeNode(nativeScope(unit), source);
    assert.equal(surface === "js" ? getCsharpJsArrayElementTargetType(completed) === element
      : completed?.kind === "array" && completed.element === element, true);
    assert.deepEqual(unit.children, ["element", "target"]);
    assert.deepEqual(unit.observations, ["array-node", "element-node", "element-storage", "authored-fallback"]);
  }
});

test("synthetic array missing element keeps the original fallback state and genuine Type absence", () => {
  for (const available of [true, false]) {
    const unit = fixture();
    unit.fallbackType = available ? {} : undefined;
    const source = capture(unit);
    const fallback = available ? { kind: "array", element: csharpSourcePrimitiveTargetType("int32") } : undefined;
    unit.fallbackCarrier = fallback;
    forbidSource(unit);
    assert.equal(resolveFormedCsharpArrayTypeNode(nativeScope(unit), source) === fallback, true);
    assert.deepEqual(unit.children, ["element", "fallback"]);
    assert.equal(source.fallback.type === unit.fallbackType, true);
  }
});

test("synthetic array H0 binds purely and foreign input is rejected before Native owners", () => {
  const owner = fixture();
  const context = formCsharpSourceStorageComponentContext(owner.host, owner.subject, { kind: "array-element" });
  const later = { ...owner.state, depth: 11, sourceBindings: new Map(), sourceStorageBindings: {} };
  const first = bindCsharpSourceStorageContext(context, owner.state);
  forbidSource(owner);
  const second = bindCsharpSourceStorageContext(context, later);
  assert.equal(first.sourceStorageSubject === owner.projected && second.sourceStorageSubject === owner.projected, true);
  assert.equal(first.sourceBindings === owner.state.sourceBindings && second.sourceBindings === later.sourceBindings, true);
  assert.equal(first.depth === owner.state.depth && second.depth === later.depth, true);
  assert.deepEqual(owner.observations, ["element-storage"]);
  assert.throws(() => bindCsharpSourceStorageContext(context, { ...later, sourceStorageSubject: {} }), /exact captured source subject/);

  const unit = fixture();
  const source = capture(unit);
  let nativeOwners = 0;
  const scope = { get host() { nativeOwners += 1; assert.fail("invalid array Source must fail before Native owners"); } };
  assert.throws(() => resolveFormedCsharpArrayTypeNode(scope, undefined), /exact element, fallback and captured storage Source/);
  assert.throws(() => resolveFormedCsharpArrayTypeNode(scope, unit.node), /exact element, fallback and captured storage Source/);
  assert.throws(() => resolveFormedCsharpArrayTypeNode(scope, { ...source, kind: "retired-array" }), /exact element, fallback and captured storage Source/);
  assert.throws(() => resolveFormedCsharpArrayTypeNode(scope, { ...source, element: undefined }), /exact element, fallback and captured storage Source/);
  assert.throws(() => resolveFormedCsharpArrayTypeNode(scope, { ...source, element: { ...source.element, node: {} } }), /exact element, fallback and captured storage Source/);
  assert.throws(() => resolveFormedCsharpArrayTypeNode(scope, { ...source, element: { ...source.element,
    state: { ...source.element.state, sourceStorageSubject: {} } } }), /exact element, fallback and captured storage Source/);
  assert.throws(() => resolveFormedCsharpArrayTypeNode(scope, { ...source, fallback: { ...source.fallback, type: {} } }), /exact element, fallback and captured storage Source/);
  assert.throws(() => resolveFormedCsharpArrayTypeNode(scope, { ...source, fallback: { ...source.fallback,
    state: { ...source.fallback.state, sourceBindings: new Map() } } }), /exact element, fallback and captured storage Source/);
  assert.equal(nativeOwners, 0);
});
