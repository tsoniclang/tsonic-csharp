import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpSemanticTupleSource, resolveFormedCsharpSemanticTupleElements } from "../../../dist/analysis/source-evidence/types/resolution/semantic-tuple-source.js";
import { bindCsharpSourceStorageContext } from "../../../dist/analysis/source-evidence/types/resolution/source-storage-projection.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

function fixture(tuple = true) {
  const unit = { type: {}, file: {}, queryFile: {}, rawElements: [{}, {}, {}], observations: [], children: [],
    projected: new Map(), unavailableStorage: new Set(), carriers: [], nativeIndex: 0 };
  const previous = { kind: "array-element" };
  unit.subject = { node: {}, kind: "input", projection: [previous] };
  unit.state = { depth: 6, sourceBindings: new Map(), sourceStorageBindings: {}, sourceStorageSubject: unit.subject,
    rejectNativeResolution: () => assert.fail("these synthetic semantic tuple leaves have no rejection") };
  unit.queries = { sourceFile: unit.queryFile, types: { isTuple(type) {
    assert.equal(type === unit.type, true);
    unit.observations.push("tuple");
    return tuple;
  }, tupleElementTypes(type) {
    assert.equal(type === unit.type, true);
    unit.observations.push("elements");
    return unit.rawElements;
  } } };
  unit.host = { sourceStorage: { subject(node, kind, projection) {
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
  unit.source = formCsharpSemanticTupleSource({ host: unit.host }, unit.type, unit.file, unit.queries, unit.state);
  return unit.source;
}

function forbidSource(unit) {
  unit.queries.types.isTuple = () => assert.fail("semantic tuple completion cannot query eligibility again");
  unit.queries.types.tupleElementTypes = () => assert.fail("semantic tuple completion cannot query elements again");
  unit.host.sourceStorage = undefined;
}

function nativeScope(unit) {
  return { resolveTypeWithState(type, file, state) {
    const index = unit.nativeIndex++;
    const request = unit.source.elements[index];
    assert.equal(type === unit.rawElements[index] && type === request.type && file === unit.file && file !== unit.queryFile && state === request.state, true);
    assert.equal(state.depth === unit.state.depth + 1 && state.sourceStorageSubject === unit.projected.get(index), true);
    assert.equal(state.sourceBindings === unit.state.sourceBindings && state.sourceStorageBindings === unit.state.sourceStorageBindings &&
      state.rejectNativeResolution === unit.state.rejectNativeResolution, true);
    unit.children.push(index);
    return unit.carriers[index];
  } };
}

test("synthetic semantic tuple keeps eligibility, unavailable vectors and genuine empty tuples distinct", () => {
  const absent = fixture(false);
  const notTuple = capture(absent);
  assert.equal(notTuple.kind === "not-tuple" && notTuple.type === absent.type && notTuple.sourceFile === absent.file &&
    notTuple.queries === absent.queries && notTuple.state === absent.state, true);
  assert.deepEqual(absent.observations, ["tuple"]);
  assert.equal(resolveFormedCsharpSemanticTupleElements({}, notTuple) === undefined, true);
  for (const sparse of [false, true]) {
    const unit = fixture();
    if (sparse) delete unit.rawElements[1];
    else unit.rawElements[1] = undefined;
    const source = capture(unit);
    assert.equal(source.kind === "unavailable" && source.rawElements === unit.rawElements, true);
    assert.deepEqual(unit.observations, ["tuple", "elements"]);
    forbidSource(unit);
    assert.equal(resolveFormedCsharpSemanticTupleElements({}, source) === undefined, true);
    assert.deepEqual(unit.children, []);
  }
  const empty = fixture();
  empty.rawElements = [];
  const source = capture(empty);
  forbidSource(empty);
  assert.equal(source.kind === "tuple" && source.rawElements === empty.rawElements && source.elements.length === 0, true);
  assert.deepEqual(resolveFormedCsharpSemanticTupleElements({}, source), []);
});

test("synthetic semantic tuple keeps the raw Types, original caller file and H0 before Native work", () => {
  const unit = fixture();
  unit.unavailableStorage.add(1);
  const source = capture(unit);
  assert.equal(source.kind === "tuple" && source.rawElements === unit.rawElements && source.type === unit.type, true);
  assert.equal(source.sourceFile === unit.file && source.queries === unit.queries && source.queries.sourceFile === unit.queryFile, true);
  for (const request of source.elements) {
    assert.equal(request.type === unit.rawElements[request.index] && request.sourceFile === unit.file, true);
    assert.equal(request.storage.inputSubject === unit.subject && request.storage.subject === unit.projected.get(request.index), true);
    assert.equal(request.state.depth === unit.state.depth + 1 && request.state.sourceStorageSubject === request.storage.subject, true);
  }
  assert.deepEqual(unit.observations, ["tuple", "elements", "storage:0", "storage:1", "storage:2"]);
  assert.deepEqual(unit.children, []);
  unit.carriers = [csharpSourcePrimitiveTargetType("int64"), csharpSourcePrimitiveTargetType("int32"), csharpSourcePrimitiveTargetType("uint64")];
  const observations = [...unit.observations];
  forbidSource(unit);
  const elements = resolveFormedCsharpSemanticTupleElements(nativeScope(unit), source);
  assert.equal(elements.length === 3 && elements.every((type, index) => type === unit.carriers[index]), true);
  assert.deepEqual(unit.children, [0, 1, 2]);
  assert.deepEqual(unit.observations, observations);
});

test("synthetic semantic tuple visits every later Native child after the first unavailable result", () => {
  const unit = fixture();
  const source = capture(unit);
  unit.carriers = [undefined, csharpSourcePrimitiveTargetType("int64"), csharpSourcePrimitiveTargetType("uint64")];
  forbidSource(unit);
  assert.equal(resolveFormedCsharpSemanticTupleElements(nativeScope(unit), source) === undefined, true);
  assert.deepEqual(unit.children, [0, 1, 2]);
});

test("synthetic semantic tuple binds H0 purely and rejects retired, sparse or foreign requests before Native work", () => {
  const unit = fixture();
  const source = capture(unit);
  const observations = [...unit.observations];
  forbidSource(unit);
  const later = { ...unit.state, depth: 12, sourceBindings: new Map(), sourceStorageBindings: {} };
  const state = bindCsharpSourceStorageContext(source.elements[0].storage, later);
  assert.equal(state.depth === later.depth && state.sourceStorageSubject === unit.projected.get(0), true);
  assert.equal(state.sourceBindings === later.sourceBindings && state.sourceStorageBindings === later.sourceStorageBindings &&
    state.rejectNativeResolution === later.rejectNativeResolution, true);
  assert.deepEqual(unit.observations, observations);
  assert.throws(() => bindCsharpSourceStorageContext(source.elements[0].storage, { ...later, sourceStorageSubject: {} }), /exact captured source subject/);
  const sparse = new Array(source.elements.length);
  sparse[2] = source.elements[2];
  const scope = { resolveTypeWithState: () => assert.fail("invalid semantic tuple Source must fail before Native children") };
  for (const invalid of [undefined, { ...source, kind: "retired" }, { ...source, kind: "unavailable" },
    { ...source, elements: sparse }, { ...source, elements: [...source.elements].reverse() },
    { ...source, elements: [{ ...source.elements[0], type: {} }, ...source.elements.slice(1)] },
    { ...source, elements: [{ ...source.elements[0], sourceFile: unit.queryFile }, ...source.elements.slice(1)] },
    { ...source, elements: [{ ...source.elements[0], state: later }, ...source.elements.slice(1)] },
  ]) assert.throws(() => resolveFormedCsharpSemanticTupleElements(scope, invalid), /exact checked elements and bound Source states/);
  const noSubject = fixture();
  noSubject.state.sourceStorageSubject = undefined;
  const absent = capture(noSubject);
  assert.equal(absent.elements.every(element => element.storage.subject === undefined && element.state.sourceStorageSubject === undefined), true);
  assert.deepEqual(noSubject.observations, ["tuple", "elements"]);
});
