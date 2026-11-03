import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpFunctionTypeNodeSource } from "../../../dist/analysis/source-evidence/types/resolution/root-sources.js";
import { resolveFormedCsharpCallableType } from "../../../dist/analysis/source-evidence/types/resolution/source-profiles.js";
import { resolveFormedCsharpNodeTypeSource } from "../../../dist/analysis/source-evidence/types/resolution/nodes.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { getCsharpDelegateSignature } from "../../../dist/target-model/types/carriers/delegates.js";

function fixture(functionNode = true) {
  const unit = { node: {}, file: {}, type: undefined, callable: undefined, observations: [], nativeChildren: [] };
  unit.queries = { sourceFile: unit.file, types: {
    authoredType(node) {
      assert.equal(node === unit.node, true);
      unit.observations.push("authored");
      return unit.type;
    },
    callable(type) {
      assert.equal(type === unit.type, true);
      unit.observations.push("callable");
      return unit.callable;
    },
    propertyInfos: () => [], indexInfos: () => [], constructSignatures: () => [],
  } };
  unit.host = { ast: { is: { IsFunctionTypeNode(node) {
    assert.equal(node === unit.node, true);
    unit.observations.push("function-node");
    return functionNode;
  } } } };
  unit.state = { depth: 5, sourceBindings: new Map(), sourceStorageBindings: {}, sourceStorageSubject: {},
    rejectNativeResolution: () => assert.fail("these synthetic signature leaves have no rejection") };
  return unit;
}

function capture(unit) {
  return formCsharpFunctionTypeNodeSource({ host: unit.host }, unit.node, unit.queries, unit.state);
}

test("synthetic non-function Node Source keeps its exact frame without authored or callable queries", () => {
  const unit = fixture(false);
  const source = capture(unit);
  assert.equal(source.kind, "not-function");
  assert.equal(source.node === unit.node && source.queries === unit.queries && source.state === unit.state, true);
  assert.equal(Object.prototype.hasOwnProperty.call(source, "type"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(source, "callable"), false);
  assert.deepEqual(unit.observations, ["function-node"]);
});

test("synthetic function Node Source distinguishes missing authored Type from missing callable metadata", () => {
  const unit = fixture();
  const unavailable = capture(unit);
  assert.equal(unavailable.kind === "function" && unavailable.type === undefined && unavailable.callable === undefined, true);
  assert.equal(unavailable.node === unit.node && unavailable.queries === unit.queries && unavailable.state === unit.state, true);
  assert.deepEqual(unit.observations, ["function-node", "authored"]);

  const selected = fixture();
  selected.type = {};
  const formed = capture(selected);
  assert.equal(formed.kind === "function" && formed.type === selected.type && formed.callable.kind === "not-callable", true);
  assert.equal(formed.callable.source.type === selected.type && formed.callable.source.queries === selected.queries, true);
  assert.equal(formed.callable.state === selected.state, true);
  assert.deepEqual(selected.observations, ["function-node", "authored", "callable"]);
  assert.equal(resolveFormedCsharpCallableType({}, formed.callable) === undefined, true);
});

test("synthetic monomorphic function Node retains the real return input before existing Native completion", () => {
  const unit = fixture();
  const result = { selectedType: {} };
  unit.type = {};
  unit.callable = { parameters: [], result };
  const formed = capture(unit);
  assert.equal(formed.kind === "function" && formed.type === unit.type && formed.state === unit.state, true);
  assert.equal(formed.callable.kind === "callable" && formed.callable.state === unit.state, true);
  assert.equal(formed.callable.source.signature.callable === unit.callable && formed.callable.source.queries === unit.queries, true);
  assert.equal(formed.callable.signature.capture.result.component === result && formed.callable.signature.resultSource.component === result, true);
  assert.equal(formed.callable.signature.state === unit.state && formed.callable.signature.returnState.depth === unit.state.depth, true);
  assert.equal(formed.callable.signature.returnState.sourceBindings === unit.state.sourceBindings &&
    formed.callable.signature.returnState.sourceStorageBindings === unit.state.sourceStorageBindings, true);
  assert.equal(formed.callable.signature.returnState.rejectNativeResolution === unit.state.rejectNativeResolution, true);
  assert.equal(formed.callable.signature.returnState.sourceStorageSubject === undefined, true,
    "this explicit monomorphic synthetic return has no declaration subject");
  assert.equal(unit.nativeChildren.length, 0);
  unit.host.ast = undefined;
  for (const key of Object.keys(unit.queries.types)) unit.queries.types[key] = () => assert.fail("the formed synthetic signature must not re-query Source");
  unit.host.projectTypeCatalog = { genericProjections: () => assert.fail("this explicit monomorphic synthetic leaf has no A declaration") };
  unit.host.objectShapes = { resolveCallableValue: () => assert.fail("this explicit monomorphic leaf needs no physical binder application") };
  const integer = csharpSourcePrimitiveTargetType("int32");
  const completed = resolveFormedCsharpCallableType({ host: unit.host,
    resolveFormedSourceTypeComponentEvidence(source) {
      assert.equal(source === formed.callable.signature.resultSource, true);
      unit.nativeChildren.push("return");
      return integer;
    },
    resolveFormedSignatureParameterEvidence: () => assert.fail("this explicit synthetic signature has no parameters"),
    resolveNodeWithState: () => assert.fail("this explicit synthetic signature has no constraint child"),
  }, formed.callable);
  assert.equal(getCsharpDelegateSignature(completed)?.returnType === integer, true);
  assert.deepEqual(unit.nativeChildren, ["return"]);
  assert.deepEqual(unit.observations, ["function-node", "authored", "callable"]);
});

test("synthetic Native Node rejects missing or foreign function inputs before any chosen child", () => {
  const unit = fixture();
  unit.type = {};
  const formed = capture(unit);
  const root = input => ({ kind: "node", node: unit.node, queries: unit.queries, state: unit.state,
    nativeParameter: { kind: "not-parameter", parameter: unit.node },
    projectInstance: { kind: "unavailable", node: unit.node },
    contextualParameter: { kind: "not-applicable", declaration: unit.node, queries: unit.queries },
    functionType: input,
  });
  let nativeReads = 0;
  const scope = { get host() { nativeReads += 1; assert.fail("foreign function inputs must fail before Native owners"); } };
  assert.throws(() => resolveFormedCsharpNodeTypeSource(scope, root(undefined)), /function-type node requires its exact/);
  assert.throws(() => resolveFormedCsharpNodeTypeSource(scope, root({ ...formed, kind: "retired-function" })), /function-type node requires its exact/);
  assert.throws(() => resolveFormedCsharpNodeTypeSource(scope, root({ ...formed, node: {} })), /function-type node requires its exact/);
  assert.throws(() => resolveFormedCsharpNodeTypeSource(scope, root({ ...formed, queries: {} })), /function-type node requires its exact/);
  assert.throws(() => resolveFormedCsharpNodeTypeSource(scope, root({ ...formed, state: { ...unit.state } })), /function-type node requires its exact/);
  assert.throws(() => resolveFormedCsharpNodeTypeSource(scope, root({ ...formed, type: undefined })), /function-type node requires its exact/);
  assert.throws(() => resolveFormedCsharpNodeTypeSource(scope, root({ ...formed, callable: undefined })), /function-type node requires its exact/);
  assert.throws(() => resolveFormedCsharpNodeTypeSource(scope, root({ ...formed,
    callable: { ...formed.callable, source: { ...formed.callable.source, type: {} } } })), /function-type node requires its exact/);
  assert.throws(() => resolveFormedCsharpNodeTypeSource(scope, root({ ...formed,
    callable: { ...formed.callable, state: { ...unit.state } } })), /function-type node requires its exact/);
  assert.equal(nativeReads, 0);
});
