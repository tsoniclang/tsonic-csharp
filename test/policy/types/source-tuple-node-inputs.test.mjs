import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpTupleTypeNodeSource } from "../../../dist/analysis/source-evidence/types/resolution/tuple-node-source.js";
import { resolveFormedCsharpTupleTypeNode } from "../../../dist/analysis/source-evidence/types/resolution/nodes.js";
import { bindCsharpSourceStorageContext } from "../../../dist/analysis/source-evidence/types/resolution/source-storage-projection.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { getCsharpJsArrayElementTargetType } from "../../../dist/target-model/types/carriers/collections.js";

function fixture(kinds = ["plain", "rest", "named", undefined], tuple = true) {
  const unit = { node: {}, file: {}, observations: [], children: [], projected: new Map(), unavailableStorage: new Set(),
    syntax: kinds.map(kind => kind === undefined ? undefined : { kind }), carriers: [], nativeIndex: 0, target: { surfaces: [] } };
  const previous = { kind: "array-element" };
  unit.subject = { node: {}, kind: "input", projection: [previous] };
  unit.state = { depth: 6, sourceBindings: new Map(), sourceStorageBindings: {}, sourceStorageSubject: unit.subject,
    rejectNativeResolution: () => assert.fail("these synthetic tuple leaves have no rejection") };
  unit.queries = { sourceFile: unit.file };
  unit.host = { ast: { is: {
    IsTupleTypeNode(node) {
      assert.equal(node === unit.node, true);
      unit.observations.push("tuple");
      return tuple;
    },
    IsRestTypeNode(node) { unit.observations.push("rest"); return node.kind === "rest"; },
    IsNamedTupleMember(node) { unit.observations.push("named"); return node.kind === "named"; },
  }, as: { AsNamedTupleMember(node) {
    assert.equal(node.kind, "named");
    unit.observations.push("named-token");
    return { DotDotDotToken: {} };
  } }, elements(node) {
    assert.equal(node === unit.node, true);
    unit.observations.push("elements");
    return unit.syntax;
  } }, sourceStorage: { subject(node, kind, projection) {
    assert.equal(node === unit.subject.node && kind === unit.subject.kind, true);
    const component = projection[1];
    assert.equal(projection.length === 2 && projection[0] === previous && component.kind === "tuple-element", true);
    unit.observations.push(`storage:${component.index}`);
    if (unit.unavailableStorage.has(component.index)) return { kind: "unavailable" };
    const subject = { node, kind, projection };
    unit.projected.set(component.index, subject);
    return { kind: "resolved", subject };
  } } };
  return unit;
}

function capture(unit) {
  unit.source = formCsharpTupleTypeNodeSource({ host: unit.host }, unit.node, unit.queries, unit.state);
  return unit.source;
}

function nativeScope(unit) {
  return { host: { get target() { unit.children.push("target"); return unit.target; } },
    resolveNodeWithState(node, file, state) {
      const index = unit.nativeIndex++;
      const request = unit.source.elements[index];
      assert.equal(node === unit.syntax[index] && node === request.node && file === unit.file && state === request.state, true);
      assert.equal(state.depth === unit.state.depth + 1 && state.sourceStorageSubject === unit.projected.get(index), true);
      assert.equal(state.sourceBindings === unit.state.sourceBindings && state.sourceStorageBindings === unit.state.sourceStorageBindings &&
        state.rejectNativeResolution === unit.state.rejectNativeResolution, true);
      unit.children.push(`child:${index}`);
      return unit.carriers[index];
    },
  };
}

function forbidSource(unit) {
  unit.host.ast = undefined;
  unit.host.sourceStorage = undefined;
}

test("synthetic tuple Source keeps ordered syntax, rest and H0 before Native children", () => {
  const absent = fixture([], false);
  const notTuple = capture(absent);
  assert.equal(notTuple.kind === "not-tuple" && notTuple.node === absent.node && notTuple.queries === absent.queries && notTuple.state === absent.state, true);
  assert.deepEqual(absent.observations, ["tuple"]);
  assert.equal(resolveFormedCsharpTupleTypeNode({}, notTuple) === undefined, true);

  const unit = fixture();
  unit.unavailableStorage.add(2);
  const source = capture(unit);
  assert.equal(source.kind === "tuple" && source.node === unit.node && source.queries === unit.queries && source.state === unit.state, true);
  assert.equal(source.syntaxElements === unit.syntax && source.elements.length === 4, true);
  assert.deepEqual(source.restIndexes, [1, 2]);
  assert.deepEqual(source.elements.map(element => element.rest), [false, true, true, false]);
  for (const request of source.elements) {
    assert.equal(request.node === unit.syntax[request.index] && request.sourceFile === unit.file, true);
    assert.equal(request.storage.inputSubject === unit.subject && request.storage.subject === unit.projected.get(request.index), true);
    assert.equal(request.state.depth === unit.state.depth + 1 && request.state.sourceStorageSubject === request.storage.subject, true);
    assert.equal(request.state.sourceBindings === unit.state.sourceBindings && request.state.sourceStorageBindings === unit.state.sourceStorageBindings &&
      request.state.rejectNativeResolution === unit.state.rejectNativeResolution, true);
  }
  assert.equal(source.elements[3].node === undefined && source.elements[2].storage.subject === undefined, true);
  assert.deepEqual(unit.children, []);
  assert.deepEqual(unit.observations, ["tuple", "elements", "storage:0", "rest", "named", "storage:1", "rest",
    "storage:2", "rest", "named", "named-token", "storage:3"]);
});

test("synthetic tuple missing child keeps every later child before the unavailable result", () => {
  const unit = fixture(["plain", undefined, "plain"]);
  const source = capture(unit);
  unit.carriers = [undefined, undefined, csharpSourcePrimitiveTargetType("int64")];
  const observations = [...unit.observations];
  forbidSource(unit);
  assert.equal(resolveFormedCsharpTupleTypeNode(nativeScope(unit), source) === undefined, true);
  assert.deepEqual(unit.children, ["child:0", "child:1", "child:2"]);
  assert.deepEqual(unit.observations, observations);
});

test("synthetic tuple Native completion keeps fixed, rest, nullable and JS carrier policy", () => {
  const element = csharpSourcePrimitiveTargetType("int64");
  const other = csharpSourcePrimitiveTargetType("int32");
  for (const surface of ["csharp", "js"]) {
    const fixed = fixture(["plain", "plain"]);
    fixed.target = { surfaces: surface === "js" ? ["js"] : [] };
    fixed.carriers = [element, other];
    const fixedSource = capture(fixed);
    forbidSource(fixed);
    const tuple = resolveFormedCsharpTupleTypeNode(nativeScope(fixed), fixedSource);
    assert.equal(tuple?.kind === "tuple" && tuple.elements[0] === element && tuple.elements[1] === other, true);
    assert.deepEqual(fixed.children, ["child:0", "child:1", "target"]);
    for (const kinds of [["rest", "plain"], ["plain", "named"]]) {
      const rest = fixture(kinds);
      rest.target = fixed.target;
      rest.carriers = kinds.map(kind => kind === "plain" ? csharpNullableTargetType(element) : { kind: "array", element });
      const restSource = capture(rest);
      forbidSource(rest);
      const result = resolveFormedCsharpTupleTypeNode(nativeScope(rest), restSource);
      assert.equal(surface === "js" ? getCsharpJsArrayElementTargetType(result) === element
        : result?.kind === "array" && result.element === element, true);
      assert.deepEqual(rest.children, ["child:0", "child:1", "target"]);
    }
  }
  for (const [kinds, carriers] of [
    [["rest", "named"], [{ kind: "array", element }, { kind: "array", element }]],
    [["plain", "rest"], [other, { kind: "array", element }]],
    [["rest"], [element]],
  ]) {
    const unit = fixture(kinds);
    unit.carriers = carriers;
    const source = capture(unit);
    forbidSource(unit);
    assert.equal(resolveFormedCsharpTupleTypeNode(nativeScope(unit), source) === undefined, true);
    assert.deepEqual(unit.children, [...kinds.map((kind, index) => `child:${index}`), "target"]);
  }
});

test("synthetic tuple H0 binds purely and foreign or sparse inputs fail before Native owners", () => {
  const unit = fixture(["plain", "rest"]);
  const source = capture(unit);
  const observations = [...unit.observations];
  forbidSource(unit);
  const later = { ...unit.state, depth: 14, sourceBindings: new Map(), sourceStorageBindings: {} };
  const bound = bindCsharpSourceStorageContext(source.elements[0].storage, later);
  assert.equal(bound.sourceStorageSubject === unit.projected.get(0) && bound.depth === later.depth, true);
  assert.equal(bound.sourceBindings === later.sourceBindings && bound.sourceStorageBindings === later.sourceStorageBindings &&
    bound.rejectNativeResolution === later.rejectNativeResolution, true);
  assert.deepEqual(unit.observations, observations);
  assert.throws(() => bindCsharpSourceStorageContext(source.elements[0].storage, { ...later, sourceStorageSubject: {} }), /exact captured source subject/);

  const scope = { get host() { assert.fail("invalid tuple Source must fail before Native owners"); },
    resolveNodeWithState: () => assert.fail("invalid tuple Source must fail before Native children") };
  const sparse = new Array(source.elements.length);
  sparse[1] = source.elements[1];
  for (const invalid of [undefined, { ...source, kind: "retired" }, { ...source, elements: sparse },
    { ...source, elements: [source.elements[1], source.elements[0]] },
    { ...source, elements: [{ ...source.elements[0], node: {} }, source.elements[1]] },
    { ...source, elements: [{ ...source.elements[0], sourceFile: {} }, source.elements[1]] },
    { ...source, elements: [{ ...source.elements[0], state: later }, source.elements[1]] },
    { ...source, restIndexes: [] }, { ...source, restIndexes: [0] },
  ]) assert.throws(() => resolveFormedCsharpTupleTypeNode(scope, invalid), /exact ordered syntax and bound Source children/);

  const missingSubject = fixture(["plain"]);
  missingSubject.state.sourceStorageSubject = undefined;
  const noStorage = capture(missingSubject);
  assert.equal(noStorage.elements[0].storage.subject === undefined && noStorage.elements[0].state.sourceStorageSubject === undefined, true);
  assert.deepEqual(missingSubject.observations, ["tuple", "elements", "rest", "named"]);
  const sparseSyntax = fixture(["plain", "rest"]);
  delete sparseSyntax.syntax[0];
  assert.throws(() => capture(sparseSyntax), /exact dense syntax element vector/);
});
