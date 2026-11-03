import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpEvidenceNodesSource, resolveFormedCsharpEvidenceNodesToCommonTarget } from "../../../dist/analysis/source-evidence/types/resolution/evidence-node-source.js";
import { formCsharpCheckerTransformationSource, resolveFormedCsharpCheckerTransformation } from "../../../dist/analysis/source-evidence/types/resolution/checker-transformation-source.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { getCsharpCallableValueSignature } from "../../../dist/target-model/types/carriers/delegates.js";

function syntheticSource() {
  const authoredRoot = {};
  const selectedType = {};
  const sourceFile = {};
  const state = { depth: 3, sourceBindings: new Map() };
  const queries = { sourceFile, facts: { authoredTypeNodes: () => [] }, types: {
    isTuple: () => false, callable: () => undefined, isNever: () => false,
  } };
  const host = { ast: { getSourceFile: () => sourceFile }, hasSemantics: () => false,
    sourceStorage: { storageSubjectFor: () => undefined },
    semantics: file => file === sourceFile ? queries : assert.fail("synthetic structural input keeps its selected checker"),
    structuralTypes: { formTypeSource: () => undefined },
  };
  return { authoredRoot, selectedType, sourceFile, state, queries, host };
}

function capture(unit, standard) {
  return formCsharpCheckerTransformationSource({ host: unit.host }, unit.authoredRoot,
    unit.selectedType, unit.queries, unit.state, standard);
}

test("synthetic evidence nodes deduplicate once and keep all Native children, equality and original states", () => {
  const unit = syntheticSource();
  const nodes = [{}, {}];
  const inputNodes = [nodes[0], nodes[0], nodes[1]];
  const input = formCsharpEvidenceNodesSource({ host: unit.host }, inputNodes, unit.selectedType, unit.queries, unit.state);
  assert.equal(input.inputNodes === inputNodes && input.nodes.length === 2 && input.nodes[0] === nodes[0] &&
    input.nodes[1] === nodes[1] && input.state === unit.state, true);
  assert.equal(input.requests.every((request, index) => request.node === nodes[index] &&
    request.source.authoredTypeNode === request.node && request.source.selectedType === unit.selectedType &&
    request.source.authoredSourceFile === unit.sourceFile && request.source.selectedSourceFile === unit.sourceFile &&
    request.source.inputState === request.state && request.state.depth === unit.state.depth + 1), true);
  unit.host.ast = undefined;
  unit.host.hasSemantics = () => assert.fail("authored availability was captured before Native");
  unit.host.sourceStorage = undefined;
  const integer = csharpSourcePrimitiveTargetType("int64");
  const other = csharpSourcePrimitiveTargetType("int32");
  for (const mode of ["missing", "equal", "different"]) {
    const order = [];
    const result = resolveFormedCsharpEvidenceNodesToCommonTarget({ resolveTypeWithState(type, file, state) {
      const index = input.requests.findIndex(request => request.source.dependencies.selected.state === state);
      assert.equal(index >= 0 && type === unit.selectedType && file === unit.sourceFile &&
        state.depth === unit.state.depth + 2 && state.sourceBindings === unit.state.sourceBindings, true);
      order.push(index);
      return mode === "missing" && index === 0 ? undefined : mode === "different" && index === 1 ? other : integer;
    } }, input);
    assert.equal(result === (mode === "equal" ? integer : undefined), true, mode);
    assert.deepEqual(order, [0, 1]);
  }
  const noChildren = { resolveTypeWithState: () => assert.fail("invalid retained evidence before Native") };
  const sparse = [...input.requests];
  delete sparse[0];
  assert.throws(() => resolveFormedCsharpEvidenceNodesToCommonTarget(noChildren, { ...input, requests: sparse }), /every exact retained authored selection/u);
  assert.throws(() => resolveFormedCsharpEvidenceNodesToCommonTarget(noChildren,
    { ...input, requests: [input.requests[1], input.requests[0]] }), /every exact retained authored selection/u);
  assert.throws(() => resolveFormedCsharpEvidenceNodesToCommonTarget(noChildren, { inputNodes }), /every exact retained authored selection/u);
});

test("synthetic checker transformation consumes its exact already-checked standard row without another query", () => {
  const unit = syntheticSource();
  unit.queries.types.standardTransformation = () => assert.fail("the Source caller supplied its already-checked row");
  unit.queries.types.isTuple = () => assert.fail("a standard transformation does not collect later tuple candidates");
  const standard = { kind: "component", component: { selectedType: {} } };
  const input = capture(unit, standard);
  assert.equal(input.kind === "standard" && input.standard.transformation === standard &&
    input.standard.queries === unit.queries && input.standard.state === unit.state &&
    input.standard.authoredRoot === unit.authoredRoot && input.standard.selectedType === unit.selectedType, true);
  unit.host.ast = undefined;
  const integer = csharpSourcePrimitiveTargetType("int64");
  let completions = 0;
  const result = resolveFormedCsharpCheckerTransformation({ resolveFormedSourceTypeComponentEvidence(source) {
    assert.equal(source === input.standard.component, true);
    completions += 1;
    return integer;
  } }, input);
  assert.equal(result === integer && completions === 1, true);
  assert.throws(() => resolveFormedCsharpCheckerTransformation({},
    { ...input, standard: { ...input.standard, queries: {} } }), /exact retained standard Source/u);
  assert.throws(() => resolveFormedCsharpCheckerTransformation({}, { authoredRoot: unit.authoredRoot }), /exact retained direct evidence/u);
});

test("synthetic checker tuple retains H0 projections and visits every later Native element after failure", () => {
  const unit = syntheticSource();
  const owner = {};
  const prefix = { kind: "tuple-element", index: 8 };
  unit.state.sourceStorageSubject = { node: owner, kind: "input", projection: [prefix] };
  const infos = Array.from({ length: 3 }, () => ({ type: {} }));
  const subjects = infos.map((_, index) => ({ node: owner, kind: "input", projection: [prefix, { kind: "tuple-element", index }] }));
  const captures = [];
  unit.queries.types.isTuple = () => true;
  unit.queries.types.tupleElementInfos = () => infos;
  unit.host.sourceStorage.subject = (node, kind, projection) => {
    const index = projection[1].index;
    assert.equal(node === owner && kind === "input" && projection[0] === prefix && projection[1].kind === "tuple-element", true);
    captures.push(index);
    return { kind: "resolved", subject: subjects[index] };
  };
  unit.host.semantics = () => assert.fail("the tuple branch does not capture a structural fallback");
  const input = capture(unit, undefined);
  assert.equal(input.kind === "tuple" && input.infos === infos && input.elements.every((element, index) =>
    element.element === infos[index] && element.state.sourceStorageSubject === subjects[index] &&
    element.evidence.state === element.state && element.evidence.selectedType === infos[index].type), true);
  assert.deepEqual(captures, [0, 1, 2]);
  unit.host.sourceStorage = undefined;
  unit.queries.types = undefined;
  const integer = csharpSourcePrimitiveTargetType("int32");
  for (const missing of [true, false]) {
    const order = [];
    const result = resolveFormedCsharpCheckerTransformation({ resolveTypeWithState(type, file, state) {
      const index = infos.findIndex(element => element.type === type);
      assert.equal(index >= 0 && file === unit.sourceFile && state.depth === unit.state.depth + 1 &&
        state.sourceStorageSubject === subjects[index] && state.sourceBindings === unit.state.sourceBindings, true);
      order.push(index);
      return missing && index === 0 ? undefined : integer;
    } }, input);
    assert.equal(missing ? result === undefined : result.kind === "tuple" &&
      result.elements.length === 3 && result.elements.every(type => type === integer), true);
    assert.deepEqual(order, [0, 1, 2]);
  }
  const sparse = [...input.elements];
  delete sparse[1];
  assert.throws(() => resolveFormedCsharpCheckerTransformation({ resolveTypeWithState: () => assert.fail("sparse tuple before Native") },
    { ...input, elements: sparse }), /every exact ordered tuple input/u);
});

test("synthetic checker value keeps direct then callable then structural Native priority on the same retained inputs", () => {
  const integer = csharpSourcePrimitiveTargetType("int32");
  for (const mode of ["direct", "callable", "structural"]) {
    const unit = syntheticSource();
    const evidenceNode = {};
    unit.host.ast.is = { IsTypeReferenceNode: () => true };
    unit.queries.facts.authoredTypeNodes = () => mode === "direct" ? [evidenceNode] : [];
    unit.queries.types.authoredType = () => unit.selectedType;
    unit.queries.types.isIdentical = () => true;
    unit.queries.types.authoredSelection = () => ({ kind: "authored-members", nodes: [evidenceNode], selectedNullishTypes: [] });
    unit.queries.types.callable = () => mode === "callable" ? { parameters: [], result: { selectedType: {} } } : undefined;
    unit.queries.types.propertyInfos = () => [];
    unit.queries.types.indexInfos = () => [];
    unit.queries.types.constructSignatures = () => [];
    const input = capture(unit, undefined);
    assert.equal(input.kind === "value" && input.callable.source.type === unit.selectedType &&
      input.callable.source.queries === unit.queries && input.callable.state === unit.state &&
      input.structural.queries === unit.queries && input.structural.state.depth === unit.state.depth + 1 &&
      input.structural.authoredTypeRoot === unit.authoredRoot, true);
    unit.host.ast = undefined;
    unit.queries.types = undefined;
    unit.host.semantics = () => assert.fail("the selected structural checker is already captured");
    unit.host.structuralTypes.formTypeSource = () => assert.fail("the structural Source is already captured");
    const order = [];
    const structural = { kind: "opaque", id: "synthetic-structural-dependency" };
    unit.host.structuralTypes.completeTypeSource = actual => {
      assert.equal(mode === "structural" && actual === input.structural, true);
      order.push("structural");
      return structural;
    };
    const result = resolveFormedCsharpCheckerTransformation({ host: unit.host,
      resolveTypeWithState() {
        assert.equal(mode === "direct", true);
        order.push("direct");
        return integer;
      },
      resolveFormedSourceTypeComponentEvidence(source) {
        assert.equal(mode === "callable" && source === input.callable.signature.resultSource, true);
        order.push("callable");
        return integer;
      },
    }, input);
    assert.equal(mode === "direct" ? result === integer : mode === "callable"
      ? getCsharpCallableValueSignature(result)?.returnType === integer : result === structural, true);
    assert.deepEqual(order, [mode]);
  }
});
