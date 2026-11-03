import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpStandardTypeTransformationSource, resolveFormedCsharpStandardTypeTransformation } from "../../../dist/analysis/source-evidence/types/resolution/standard-transformation-source.js";
import { csharpSourcePrimitiveTargetType, isCsharpNeverTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";

function syntheticSource() {
  const selectedType = {};
  const authoredRoot = {};
  const sourceFile = {};
  const state = { depth: 3, sourceBindings: new Map() };
  const queries = { sourceFile, types: { isNever: () => false } };
  const host = { ast: {}, sourceStorage: {} };
  return { selectedType, authoredRoot, state, queries, host };
}

function capture(unit, transformation) {
  return formCsharpStandardTypeTransformationSource({ host: unit.host }, transformation,
    unit.queries, unit.state, unit.authoredRoot, unit.selectedType);
}

test("synthetic checked transformation keeps its component and never decision before Native without late Source reads", () => {
  const integer = csharpSourcePrimitiveTargetType("int32");
  const nullable = csharpNullableTargetType(integer);
  for (const kind of ["component", "non-nullish"]) {
    const unit = syntheticSource();
    const component = { selectedType: {} };
    const transformation = { kind, component };
    const input = capture(unit, transformation);
    assert.equal(input.transformation === transformation && input.component.component === component &&
      input.component.queries === unit.queries && input.component.inputState === unit.state, true);
    assert.equal(input.queries === unit.queries && input.state === unit.state &&
      input.authoredRoot === unit.authoredRoot && input.selectedType === unit.selectedType && Object.isFrozen(input), true);
    unit.host.ast = undefined;
    unit.queries.types.isNever = () => assert.fail("the never predicate was already captured before Native");
    let completions = 0;
    const type = resolveFormedCsharpStandardTypeTransformation({
      resolveFormedSourceTypeComponentEvidence(source) {
        assert.equal(source === input.component, true);
        completions += 1;
        return nullable;
      },
    }, input);
    assert.equal(type === (kind === "non-nullish" ? integer : nullable) && completions === 1, true);
    assert.throws(() => resolveFormedCsharpStandardTypeTransformation({
      resolveFormedSourceTypeComponentEvidence: () => assert.fail("foreign component before Native"),
    }, { ...input, component: { ...input.component, component: {} } }), /exact retained component/u);
  }
  const unit = syntheticSource();
  unit.queries.types.isNever = () => true;
  const input = capture(unit, { kind: "non-nullish", component: { selectedType: {}, authoredTypeNode: {} } });
  assert.equal(input.kind === "never" && !Object.hasOwn(input, "component"), true);
  unit.queries.types.isNever = () => assert.fail("the selected never branch has no Native Source query");
  assert.equal(isCsharpNeverTargetType(resolveFormedCsharpStandardTypeTransformation({}, input)), true);
  const unresolved = capture(unit, { kind: "unresolved" });
  assert.equal(resolveFormedCsharpStandardTypeTransformation({}, unresolved) === undefined, true);
  assert.throws(() => resolveFormedCsharpStandardTypeTransformation({}, { kind: "unresolved" }), /exact retained Source decision/u);
});

test("synthetic parameter-list transformation keeps every ordered request and completes later children after failure", () => {
  const unit = syntheticSource();
  const parameters = Array.from({ length: 3 }, () => ({ type: {}, parameterKind: "required",
    omissionKind: "required", acceptsOmission: false }));
  const input = capture(unit, { kind: "parameter-list", parameters });
  assert.equal(input.parameters.length === parameters.length && input.parameters.every((source, index) =>
    source.capture.parameter === parameters[index] && source.capture.queries === unit.queries &&
    source.capture.use === "parameter-list" && source.state === unit.state), true);
  unit.host.ast = undefined;
  unit.host.sourceStorage = undefined;
  const integer = csharpSourcePrimitiveTargetType("int32");
  const order = [];
  const missing = resolveFormedCsharpStandardTypeTransformation({
    resolveFormedSignatureParameterEvidence(source) {
      const index = input.parameters.indexOf(source);
      assert.equal(index >= 0, true);
      order.push(index);
      return index === 0 ? undefined : integer;
    },
    resolveSignatureParameterListTarget: () => assert.fail("an unavailable parameter keeps the tuple unavailable"),
  }, input);
  assert.equal(missing === undefined, true);
  assert.deepEqual(order, [0, 1, 2]);
  const tuple = { kind: "tuple", elements: parameters.map(() => integer) };
  const completed = resolveFormedCsharpStandardTypeTransformation({
    resolveFormedSignatureParameterEvidence: source => input.parameters.includes(source) ? integer : assert.fail("foreign parameter"),
    resolveSignatureParameterListTarget(original, elements) {
      assert.equal(original === parameters && elements.length === parameters.length && elements.every(type => type === integer), true);
      return tuple;
    },
  }, input);
  assert.equal(completed === tuple, true);
  const noChildren = { resolveFormedSignatureParameterEvidence: () => assert.fail("invalid vector before Native") };
  const sparse = [...input.parameters];
  delete sparse[1];
  assert.throws(() => resolveFormedCsharpStandardTypeTransformation(noChildren,
    { ...input, parameters: sparse }), /every exact ordered parameter input/u);
  assert.throws(() => resolveFormedCsharpStandardTypeTransformation(noChildren,
    { ...input, parameters: [input.parameters[1], input.parameters[0], input.parameters[2]] }), /every exact ordered parameter input/u);
});

test("synthetic callable transformation retains its original signature and return input for one Native dependency", () => {
  const unit = syntheticSource();
  const parameter = { type: {}, parameterKind: "required", omissionKind: "required", acceptsOmission: false };
  const callable = { parameters: [parameter], result: { selectedType: {} } };
  const input = capture(unit, { kind: "callable", callable });
  assert.equal(input.callable.source.callable === callable && input.callable.source.queries === unit.queries &&
    input.callable.state === unit.state && input.callable.parameters[0].capture.parameter === parameter, true);
  assert.equal(input.callable.resultSource.component === callable.result &&
    input.callable.resultSource.inputState === input.callable.returnState &&
    input.callable.returnState.sourceBindings === unit.state.sourceBindings, true);
  unit.host.ast = undefined;
  unit.host.sourceStorage = undefined;
  const native = { kind: "opaque", id: "synthetic-callable-dependency" };
  let completions = 0;
  const result = resolveFormedCsharpStandardTypeTransformation({
    resolveFormedCallableEvidence(source) {
      assert.equal(source === input.callable, true);
      completions += 1;
      return native;
    },
  }, input);
  assert.equal(result === native && completions === 1, true);
  assert.throws(() => resolveFormedCsharpStandardTypeTransformation({
    resolveFormedCallableEvidence: () => assert.fail("foreign callable before Native"),
  }, { ...input, callable: { ...input.callable, source: { ...input.callable.source, callable: {} } } }), /exact retained callable input/u);
});

test("synthetic structural transformation keeps the host-selected queries and original next state without a late former", () => {
  const unit = syntheticSource();
  const structuralQueries = { sourceFile: unit.queries.sourceFile };
  const source = {};
  let semanticReads = 0;
  let sourceReads = 0;
  unit.host.semantics = file => {
    assert.equal(file === unit.queries.sourceFile, true);
    semanticReads += 1;
    return structuralQueries;
  };
  unit.host.structuralTypes = {
    formTypeSource(type, queries, state, authoredTypeRoot) {
      assert.equal(type === unit.selectedType && queries === structuralQueries && authoredTypeRoot === unit.authoredRoot &&
        state.depth === unit.state.depth + 1 && state.sourceBindings === unit.state.sourceBindings, true);
      sourceReads += 1;
      return Object.assign(source, { type, queries, state, authoredTypeRoot });
    },
  };
  const input = capture(unit, { kind: "structural" });
  assert.equal(input.structural.source === source && input.structural.queries === structuralQueries &&
    input.structural.state === source.state && input.state === unit.state, true);
  assert.equal(semanticReads === 1 && sourceReads === 1, true);
  unit.host.semantics = () => assert.fail("structural queries were retained before Native");
  unit.host.structuralTypes.formTypeSource = () => assert.fail("structural Source was retained before Native");
  const native = { kind: "opaque", id: "synthetic-structural-dependency" };
  let completions = 0;
  unit.host.structuralTypes.completeTypeSource = actual => {
    assert.equal(actual === input.structural && actual.source === source, true);
    completions += 1;
    return native;
  };
  assert.equal(resolveFormedCsharpStandardTypeTransformation({ host: unit.host }, input) === native && completions === 1, true);
  assert.throws(() => resolveFormedCsharpStandardTypeTransformation({ host: unit.host },
    { ...input, structural: { ...input.structural, type: {} } }), /exact retained structural input/u);
});
