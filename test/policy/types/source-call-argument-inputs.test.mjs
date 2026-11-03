import assert from "node:assert/strict";
import test from "node:test";
import { completeCsharpSourceCallArgumentParameterSource } from "../../../dist/analysis/source-evidence/types/resolution/call-argument-source.js";
import { formCsharpSourceCallContractSource } from "../../../dist/analysis/source-evidence/types/resolution/call-contracts.js";
import { formCsharpSourceCallableSource } from "../../../dist/analysis/program/source-callable-source.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int64" });

function fixture() {
  const sourceFile = {};
  const parameterDeclaration = {};
  const checkedParameter = Object.freeze({ parameterDeclaration, parameterName: "value", selectedType: {}, rest: false });
  const binding = Object.freeze({ sourceArgumentIndex: 0, effectiveArgumentIndex: 0, sourceParameterIndex: 0, sourceForm: "value" });
  const source = Object.freeze({ call: {}, sourceCallee: { expression: {} }, selectedSignature: {},
    sourceSelectedSignatureParameters: Object.freeze([checkedParameter]), sourceArgumentBindings: Object.freeze([binding]) });
  const ast = { is: { IsNewExpression: () => true, IsClassDeclaration: () => false } };
  const navigation = { sourceReferenceFor: () => undefined, callableImplementation: () => undefined,
    isProjectDeclaration: () => false };
  const queries = Object.freeze({ sourceFile, declarations: { signatureDeclaration: () => undefined } });
  const host = { ast, representations: { sourceCallableSource: (call, file) => formCsharpSourceCallableSource({ ast, navigation,
    semantics: { forFile: () => queries } }, { get: () => undefined }, call, file) } };
  const input = formCsharpSourceCallContractSource({ host }, source, sourceFile);
  const parameter = Object.freeze({ sourceParameter: parameterDeclaration,
    targetParameter: Object.freeze({ name: "value", type: integer, passingMode: "by-value" }) });
  const callable = Object.freeze({ nativeParameters: Object.freeze([parameter]) });
  const selection = Object.freeze({ kind: "declaration", contract: callable });
  const excluded = new Set([0, 2]);
  return { input, source, checkedParameter, binding, parameter, callable, selection, excluded };
}

test("UNIT argument selection exposes the same checked and native association before its type child", () => {
  const current = fixture();
  const completion = completeCsharpSourceCallArgumentParameterSource(current.input, current.binding, undefined, current.excluded);
  const contract = completion.next();
  assert.equal(contract.done === false && contract.value.kind === "contract", true);
  const association = contract.value.association;
  assert.equal(association.source === current.input && association.binding === current.binding &&
    association.checkedParameter === current.checkedParameter && association.excludedSourceArgumentIndexes === current.excluded, true);
  const parameters = completion.next({ kind: "contract", request: contract.value, selection: current.selection });
  assert.equal(parameters.done === false && parameters.value.kind === "parameters" &&
    parameters.value.callable === current.callable && parameters.value.association === association, true);
  const type = completion.next({ kind: "parameters", request: parameters.value, matches: true });
  assert.equal(type.done === false && type.value.kind === "contracted" && type.value.selection === current.selection &&
    type.value.parameter === current.parameter && type.value.association === association, true,
    "the exact chosen association is observable before the native type child is answered");
  assert.equal(contract.value.state.depth === 0 && type.value.state.depth === 0 && type.value.state !== contract.value.state, true);
  const completed = completion.next({ kind: "contracted", request: type.value,
    completion: { input: type.value.typeInput, type: integer } });
  assert.equal(completed.done && completed.value?.type === integer && completed.value.association === association &&
    completed.value.selection === current.selection && completed.value.parameter === current.parameter, true);
});

test("UNIT argument dependency short circuits retain rejection and the checked fallback without another selector", () => {
  const current = fixture();
  const missing = completeCsharpSourceCallArgumentParameterSource(current.input,
    { ...current.binding, sourceParameterIndex: 9 }, undefined, current.excluded).next();
  assert.equal(missing.done && missing.value === undefined, true);
  const rejected = completeCsharpSourceCallArgumentParameterSource(current.input, current.binding, undefined, current.excluded);
  const rejectedRequest = rejected.next().value;
  const rejectedResult = rejected.next({ kind: "contract", request: rejectedRequest, selection: { kind: "rejected" } });
  assert.equal(rejectedResult.done && rejectedResult.value === undefined, true);
  const mismatch = completeCsharpSourceCallArgumentParameterSource(current.input, current.binding, undefined, current.excluded);
  const mismatchContract = mismatch.next().value;
  const mismatchParameters = mismatch.next({ kind: "contract", request: mismatchContract, selection: current.selection }).value;
  const mismatched = mismatch.next({ kind: "parameters", request: mismatchParameters, matches: false });
  assert.equal(mismatched.done && mismatched.value === undefined, true);
  const foreign = completeCsharpSourceCallArgumentParameterSource(current.input, current.binding, undefined, current.excluded);
  const foreignContract = foreign.next().value;
  const foreignResult = foreign.next({ kind: "contract", request: foreignContract,
    selection: { kind: "value", contract: { nativeParameters: [{ ...current.parameter, sourceParameter: {} }] } } });
  assert.equal(foreignResult.done && foreignResult.value === undefined, true,
    "a foreign stored parameter refuses before the parameter-check and type children");
  const checked = completeCsharpSourceCallArgumentParameterSource(current.input, current.binding, undefined, current.excluded);
  const checkedContract = checked.next().value;
  const checkedType = checked.next({ kind: "contract", request: checkedContract,
    selection: { kind: "declaration", contract: undefined } });
  assert.equal(checkedType.done === false && checkedType.value.kind === "checked" &&
    checkedType.value.association.excludedSourceArgumentIndexes === current.excluded && checkedType.value.state.depth === 0, true);
  const unresolved = checked.next({ kind: "checked", request: checkedType.value, type: undefined });
  assert.equal(unresolved.done && unresolved.value === undefined, true);
});

test("UNIT argument child replies require the exact request and operation kind", () => {
  const current = fixture();
  const wrongRequest = completeCsharpSourceCallArgumentParameterSource(current.input, current.binding, undefined, current.excluded);
  const request = wrongRequest.next().value;
  assert.throws(() => wrongRequest.next({ kind: "contract", request: { ...request }, selection: current.selection }), /exact selected contract/);
  const wrongKind = completeCsharpSourceCallArgumentParameterSource(current.input, current.binding, undefined, current.excluded);
  const original = wrongKind.next().value;
  assert.throws(() => wrongKind.next({ kind: "parameters", request: original, matches: true }), /exact selected contract/);
});
