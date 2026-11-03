import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpSourceCallableSource } from "../../../dist/analysis/program/source-callable-source.js";
import { formCsharpSourceCallContractSource } from "../../../dist/analysis/source-evidence/types/resolution/call-contracts.js";
import { formCsharpSourceCallConstructionSource } from "../../../dist/analysis/source-evidence/types/resolution/expression-source.js";
import { completeCsharpSourceCallReceiver } from "../../../dist/analysis/source-evidence/types/resolution/calls.js";
import { completeCsharpSourceCallableTypeSource } from "../../../dist/analysis/source-evidence/types/resolution/call-type-source.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int64" });

function fixture() {
  const sourceFile = {};
  const declaration = {};
  const source = Object.freeze({ call: {}, sourceCallee: { expression: {}, selectedDeclaration: declaration },
    selectedSignature: {}, sourceSelectedSignatureParameters: [] });
  const ast = { is: { IsNewExpression: () => true, IsClassDeclaration: node => node === declaration },
    kindName: () => "KindIdentifier" };
  const navigation = { sourceReferenceFor: () => undefined, callableImplementation: () => undefined,
    isProjectDeclaration: node => node === declaration };
  const queries = { sourceFile, declarations: { signatureDeclaration: () => undefined },
    operations: { callResult: () => assert.fail("UNIT project class must not collect its unused result fallback") } };
  const host = { ast, navigation, representations: { sourceCallableSource: (call, file) =>
    formCsharpSourceCallableSource({ ast, navigation, semantics: { forFile: () => queries } },
      { get: () => undefined }, call, file) } };
  const scope = { host, sourceCallSelectedDeclaration: () => declaration };
  const contract = formCsharpSourceCallContractSource(scope, source, sourceFile);
  const construction = formCsharpSourceCallConstructionSource(scope, contract);
  const state = Object.freeze({ depth: 2 });
  return { source, sourceFile, declaration, queries, scope, contract, construction, state };
}

test("UNIT owned constructor receiver consumes its exact retained Source packet at the original child state", () => {
  const current = fixture();
  assert.equal(current.construction?.contract === current.contract && current.construction.queries === current.queries &&
    current.construction.projectDeclaration && current.construction.resultSource === undefined, true);
  current.scope.host.representations.sourceCallableSource = () => assert.fail("UNIT Native receiver must not re-form Source");
  current.queries.declarations.signatureDeclaration = () => assert.fail("UNIT Native receiver must not re-query the declaration");
  const input = Object.freeze({ source: current.source, sourceFile: current.sourceFile,
    state: current.state, construction: current.construction });
  let completions = 0;
  const result = completeCsharpSourceCallReceiver({ ...current.scope,
    resolveNodeWithState: () => assert.fail("UNIT project class must not resolve the unused factory child"),
    resolveTypeWithState: () => assert.fail("UNIT owned construction must not resolve the result fallback"),
    completeSelectedReceiver: () => assert.fail("UNIT owned construction must not resolve a selected receiver"),
    resolveFormedSourceOwnedConstructionResult: (source, state) => {
      assert.equal(source === current.construction && state.depth === 3 && state !== current.state, true);
      completions++;
      return integer;
    },
  }, input);
  assert.equal(result?.input === input && result.kind === "owned-construction" && result.projectClass &&
    result.factory === undefined && result.type === integer && completions === 1, true);
});

test("UNIT callable receiver dependency retains construction identity and refuses missing or foreign packets", () => {
  const current = fixture();
  const input = Object.freeze({ source: current.source, sourceFile: current.sourceFile,
    state: current.state, construction: current.construction, callable: { nativeSignature: {} },
    type: integer, excludedSourceArgumentIndexes: undefined });
  const completion = completeCsharpSourceCallableTypeSource(input);
  const instantiation = completion.next();
  assert.equal(instantiation.done === false && instantiation.value.kind === "instantiation", true);
  const receiver = completion.next({ kind: "instantiation", request: instantiation.value,
    instantiation: { arguments: [], substitutions: new Map(), sourceArguments: [], inference: undefined } });
  assert.equal(receiver.done === false && receiver.value.kind === "receiver" &&
    receiver.value.receiverInput.construction === current.construction &&
    receiver.value.receiverInput.source === current.source && receiver.value.receiverInput.state === current.state, true);
  const scope = { ...current.scope, resolveFormedSourceOwnedConstructionResult: () =>
    assert.fail("UNIT missing or foreign construction must not reach the Native child") };
  assert.throws(() => completeCsharpSourceCallReceiver(scope,
    { ...receiver.value.receiverInput, construction: undefined }), /exact retained source input/);
  assert.throws(() => completeCsharpSourceCallReceiver(scope, { ...receiver.value.receiverInput,
    construction: { ...current.construction, contract: { ...current.contract, source: {} } } }), /exact retained source input/);
});
