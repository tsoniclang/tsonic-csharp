import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpLiteralCreationContext } from "../../../dist/analysis/objects/literal-creation-source.js";
import { formCsharpLiteralCreationContextSource, completeCsharpLiteralCreationContextSource,
  resolveFormedCsharpLiteralCreationContext } from "../../../dist/analysis/source-evidence/types/resolution/literal-creation-context.js";
import { formCsharpSourceCallContractSource } from "../../../dist/analysis/source-evidence/types/resolution/call-contracts.js";
import { formCsharpSourceCallableSource } from "../../../dist/analysis/program/source-callable-source.js";
import { csharpDelegateTargetType, csharpTaskTargetType } from "../../../dist/target-model/types/carriers/delegates.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int64" });
const floating = Object.freeze({ kind: "source-primitive", name: "float64" });

function fixture(count = 3, argument, returnedFrom) {
  const queries = Object.freeze({ sourceFile: {} });
  const component = Object.freeze({ selectedType: {}, declaration: {} });
  const contexts = Object.freeze(Array.from({ length: count }, () => Object.freeze({ authority: "own", component,
    declarations: Object.freeze([]), source: {}, argument, returnedFrom })));
  const creation = Object.freeze({ expression: {}, queries, contexts, declarations: Object.freeze([]), blocked: false,
    uncontextualizedArguments: Object.freeze([]), untypedReturns: Object.freeze([]) });
  const selection = selectCsharpLiteralCreationContext(creation);
  const sources = contexts.map(() => Object.freeze({ type: {}, queries, state: Object.freeze({ depth: 0 }),
    authoredTypeRoot: undefined, source: undefined }));
  return { creation, selection, contexts, sources,
    inputs: contexts.map((context, index) => ({ kind: "component", context, source: sources[index] })) };
}

function callSource() {
  const sourceFile = {};
  const binding = Object.freeze({ sourceArgumentIndex: 0, effectiveArgumentIndex: 0, sourceParameterIndex: 0, sourceForm: "value" });
  const parameter = {};
  const source = Object.freeze({ call: {}, sourceCallee: { expression: {} }, selectedSignature: {},
    sourceSelectedSignatureParameters: [{ parameterDeclaration: parameter }], sourceArgumentBindings: [binding] });
  const ast = { is: { IsNewExpression: () => true, IsClassDeclaration: () => false } };
  const navigation = { sourceReferenceFor: () => undefined, callableImplementation: () => undefined,
    isProjectDeclaration: () => false };
  const queries = Object.freeze({ sourceFile, declarations: { signatureDeclaration: () => undefined } });
  const moduleCallables = Object.freeze({ get: () => undefined });
  const host = { ast, representations: { sourceCallableSource: (call, file) => formCsharpSourceCallableSource({ ast,
    navigation, semantics: { forFile: () => queries } }, moduleCallables, call, file) } };
  const contract = formCsharpSourceCallContractSource({ host }, source, sourceFile);
  const argument = Object.freeze({ source, correspondence: Object.freeze({ binding }), excludedSourceArgumentIndexes: new Set([0, 2]) });
  return { contract, argument, parameter };
}

test("UNIT literal context binding retains the canonical selection and every ordered source request", () => {
  const current = fixture();
  const source = formCsharpLiteralCreationContextSource(current.creation, current.selection, current.inputs);
  assert.equal(source.creation === current.creation && source.context === current.selection, true);
  assert.equal(source.context.creation === current.creation && Object.isFrozen(source.context), true);
  assert.equal(source.dependencies.length, current.contexts.length);
  assert.equal(source.dependencies.every((request, index) => request.context === current.contexts[index] &&
    request.source === current.sources[index]), true);
  const other = fixture();
  assert.throws(() => formCsharpLiteralCreationContextSource(current.creation, other.selection, current.inputs), /canonical selection/);
  assert.throws(() => formCsharpLiteralCreationContextSource(current.creation, current.selection, current.inputs.slice(1)), /every ordered/);
  const sparse = current.inputs.slice();
  delete sparse[1];
  assert.throws(() => formCsharpLiteralCreationContextSource(current.creation, current.selection, sparse), /every ordered/);
  const blocked = Object.freeze({ ...current.creation, blocked: true });
  const selection = selectCsharpLiteralCreationContext(blocked);
  const rejected = completeCsharpLiteralCreationContextSource(formCsharpLiteralCreationContextSource(blocked, selection, current.inputs)).next();
  assert.equal(selection === undefined && rejected.done && rejected.value === undefined, true);
});

test("UNIT literal unavailable context keeps its position and evaluates all later native children", () => {
  const current = fixture();
  current.inputs[0] = { context: current.contexts[0], kind: "unavailable", selectedType: undefined };
  const source = formCsharpLiteralCreationContextSource(current.creation, current.selection, current.inputs);
  const visited = [];
  const completed = resolveFormedCsharpLiteralCreationContext({ host: { structuralTypes: { completeTypeSource: request => {
    visited.push(request);
    return integer;
  } } } }, source);
  assert.equal(completed === undefined, true);
  assert.equal(source.dependencies[0].kind === "unavailable" && source.dependencies[0].selectedType === undefined, true);
  assert.equal(visited.length === 2 && visited[0] === current.sources[1] && visited[1] === current.sources[2], true);
});

test("UNIT literal context generator visits every request after an earlier unresolved native outcome", () => {
  const current = fixture();
  const source = formCsharpLiteralCreationContextSource(current.creation, current.selection, current.inputs);
  const completion = completeCsharpLiteralCreationContextSource(source);
  let step = completion.next();
  let count = 0;
  while (!step.done) {
    assert.equal(step.value === source.dependencies[count], true, "the original ordered request is yielded");
    step = completion.next({ request: step.value, type: count++ === 0 ? undefined : integer, argument: undefined });
  }
  assert.equal(count === 3 && step.value === undefined, true);
});

test("UNIT literal native context agreement never chooses the first conflicting carrier", () => {
  const current = fixture();
  const source = formCsharpLiteralCreationContextSource(current.creation, current.selection, current.inputs);
  const run = types => {
    const completion = completeCsharpLiteralCreationContextSource(source);
    let step = completion.next();
    let index = 0;
    while (!step.done) step = completion.next({ request: step.value, type: types[index++], argument: undefined });
    return step.value;
  };
  const agreed = run([integer, integer, integer]);
  assert.equal(agreed?.destinationType === integer && agreed.source === source && agreed.context === current.selection, true);
  assert.equal(run([integer, floating, integer]) === undefined, true);
});

test("UNIT literal context replies must retain the exact requested dependency", () => {
  const current = fixture();
  const source = formCsharpLiteralCreationContextSource(current.creation, current.selection, current.inputs);
  const completion = completeCsharpLiteralCreationContextSource(source);
  const step = completion.next();
  assert.equal(step.done, false);
  assert.throws(() => completion.next({ request: source.dependencies[1], type: integer, argument: undefined }), /exact chosen native dependency/);
});

test("UNIT literal arguments cannot substitute checked or unavailable component requests", () => {
  const call = callSource();
  const current = fixture(1, call.argument);
  assert.equal(current.selection.argument === call.argument && current.creation.contexts[0].argument === call.argument, true);
  assert.throws(() => formCsharpLiteralCreationContextSource(current.creation, current.selection, current.inputs), /cannot substitute/);
  assert.throws(() => formCsharpLiteralCreationContextSource(current.creation, current.selection,
    [{ context: current.contexts[0], kind: "unavailable", selectedType: undefined }]), /cannot substitute/);
  assert.throws(() => formCsharpLiteralCreationContextSource(current.creation, current.selection,
    [{ context: current.contexts[0], kind: "argument", contract: call.contract, asynchronous: true }]), /exact checked call source/);
});

test("UNIT literal formal completion retains exclusions and exact synchronous and async callback returns", () => {
  for (const mode of ["argument", "return", "async-return"]) {
    const call = callSource();
    const current = fixture(1, call.argument, mode === "argument" ? undefined : {});
    const source = formCsharpLiteralCreationContextSource(current.creation, current.selection,
      [{ context: current.contexts[0], kind: "argument", contract: call.contract, asynchronous: mode === "async-return" }]);
    const formal = mode === "argument" ? integer
      : csharpDelegateTargetType("System.Func", [], mode === "return" ? integer : csharpTaskTargetType(integer));
    const native = { nativeParameters: [{ sourceParameter: call.parameter,
      targetParameter: { name: "value", type: formal, passingMode: "by-value" } }] };
    const scope = { host: { representations: {
      sourceCallableSource: () => assert.fail("UNIT native completion must not re-form Source"),
      completeSourceCallable: (actual, selection) => {
        assert.equal(actual === call.contract.callableSource && selection === "implementation", true);
        return native;
      },
    } }, sourceCallableTypeParametersMatch: () => true,
    resolveSourceCallableContractType: (actual, contract, type, file, state, excluded) => {
      assert.equal(actual === call.argument.source && contract === native && type === formal &&
        file === call.contract.sourceFile && state.depth === 0 && excluded === call.argument.excludedSourceArgumentIndexes, true);
      return type;
    }, resolveSourceCallSelectedType: () => assert.fail("UNIT completed formal must not fall back to a checked width") };
    const completed = resolveFormedCsharpLiteralCreationContext(scope, source);
    assert.equal(completed?.destinationType === integer && completed.context === current.selection, true, mode);
    assert.equal(source.dependencies[0].argument === call.argument, true);
    const receipt = completed.completions[0].argument;
    assert.equal(receipt?.association.source === call.contract && receipt.association.binding === call.argument.correspondence.binding &&
      receipt.association.checkedParameter === call.contract.source.sourceSelectedSignatureParameters[0] &&
      receipt.association.excludedSourceArgumentIndexes === call.argument.excludedSourceArgumentIndexes &&
      receipt.selection.contract === native && receipt.kind === "contracted" && receipt.parameter === native.nativeParameters[0], true,
      "the one actual native driver publishes its same chosen association");
  }
});
