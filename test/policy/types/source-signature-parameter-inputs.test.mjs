import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpSignatureParameterCapture, bindCsharpSignatureParameterCapture } from "../../../dist/analysis/source-evidence/types/resolution/signature-parameter-source.js";
import { resolveFormedCsharpSignatureParameterEvidence, resolveFormedCsharpCallableDeclarationSignature } from "../../../dist/analysis/source-evidence/types/resolution/source-profiles.js";
import { formCsharpCallableDeclaration } from "../../../dist/analysis/source-evidence/types/resolution/callable-type-parameters.js";
import { formCsharpCallableSignatureSource } from "../../../dist/analysis/source-evidence/types/resolution/callable-signature-source.js";
import { formCsharpCallableSignatureCapture, bindCsharpCallableSignatureCapture } from "../../../dist/analysis/source-evidence/types/resolution/callable-signature-completion.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";

function fixture(count = 1) {
  const owner = {};
  const sourceFile = {};
  const declarations = Array.from({ length: count }, () => ({}));
  const annotations = declarations.map(() => ({}));
  const parameters = declarations.map(declaration => ({ declaration, type: {}, parameterKind: "required",
    omissionKind: "required", acceptsOmission: false }));
  const subjects = declarations.map(node => ({ node, kind: "input", projection: [] }));
  const resultSubject = { node: owner, kind: "return", projection: [] };
  const observations = [];
  const queries = { sourceFile };
  const host = { ast: {
    typeParameters: () => [],
    typeNode: node => annotations[declarations.indexOf(node)],
    parent: node => declarations.includes(node) ? owner : undefined,
    body: node => node === owner ? {} : undefined,
    getSourceFile: () => sourceFile,
    is: { IsParameterDeclaration: node => declarations.includes(node), IsTypeAliasDeclaration: () => false,
      IsInterfaceDeclaration: () => false, IsTypeParameterDeclaration: () => false },
  }, hasSemantics: () => false, sourceStorage: {
    subject(node, kind) {
      const index = declarations.indexOf(node);
      assert.equal(index >= 0 ? kind === "input" : node === owner && kind === "return", true);
      observations.push(index >= 0 ? `input${index}` : "return");
      return { kind: "resolved", subject: index >= 0 ? subjects[index] : resultSubject };
    },
    storageSubjectFor: () => assert.fail("every synthetic child has its retained actual H0 subject"),
  } };
  return { owner, sourceFile, declarations, parameters, subjects, resultSubject, queries, host, observations };
}

test("synthetic signature parameter capture binds later states and preserves H0 and projection without Native Source reads", () => {
  const unit = fixture();
  const capture = formCsharpSignatureParameterCapture(unit.host, unit.parameters[0], unit.queries, "callable", undefined);
  assert.equal(capture.parameter === unit.parameters[0] && capture.queries === unit.queries &&
    capture.subject === unit.subjects[0] && capture.nativeParameter.owner === unit.owner && !Object.hasOwn(capture, "state"), true);
  assert.deepEqual(unit.observations, ["input0"]);
  unit.host.ast = undefined;
  unit.host.sourceStorage = undefined;
  const integer = csharpSourcePrimitiveTargetType("int32");
  const order = [];
  for (const depth of [2, 8]) {
    const state = { depth, sourceBindings: new Map(), sourceStorageSubject: {},
      rejectNativeResolution: () => assert.fail("the synthetic native projection is resolved") };
    const input = bindCsharpSignatureParameterCapture(capture, state);
    const completed = resolveFormedCsharpSignatureParameterEvidence({
      resolveFormedSourceTypeComponentEvidence(source) {
        assert.equal(source === input.component && source.capture === capture.component &&
          source.inputState === input.componentState && source.inputState.sourceStorageSubject === unit.subjects[0] &&
          source.inputState.sourceBindings === state.sourceBindings && source.inputState.depth === depth, true);
        order.push("component");
        return integer;
      },
      host: { objectShapes: { resolveNativeParameter(owner, declaration, type) {
        assert.equal(owner === unit.owner && declaration === unit.declarations[0] && type === integer, true);
        order.push("projection");
        return { kind: "resolved", type };
      } } },
    }, input);
    assert.equal(completed === integer && input.state === state &&
      state.sourceStorageSubject !== unit.subjects[0], true, "the original caller is retained rather than mutated");
  }
  assert.deepEqual(order, ["component", "projection", "component", "projection"]);
  assert.deepEqual(unit.observations, ["input0"]);
});

test("synthetic callable and parameter-list sources keep their original subjects and nullable policy", () => {
  const integer = csharpSourcePrimitiveTargetType("int32");
  for (const use of ["callable", "parameter-list"]) {
    const unit = fixture();
    const parameter = { ...unit.parameters[0], parameterKind: "optional", omissionKind: "undefined" };
    const incoming = { node: {}, kind: "member", projection: [] };
    const capture = formCsharpSignatureParameterCapture(unit.host, parameter, unit.queries, use, incoming);
    const state = { depth: 4, sourceStorageSubject: incoming, sourceBindings: new Map() };
    const input = bindCsharpSignatureParameterCapture(capture, state);
    let projections = 0;
    const result = resolveFormedCsharpSignatureParameterEvidence({
      resolveFormedSourceTypeComponentEvidence(source) {
        assert.equal(source.inputState.sourceStorageSubject === (use === "callable" ? unit.subjects[0] : incoming) &&
          source.inputState.sourceBindings === state.sourceBindings, true);
        return integer;
      },
      host: { objectShapes: { resolveNativeParameter(owner, declaration, type) {
        projections += 1;
        assert.equal(owner === unit.owner && declaration === unit.declarations[0] &&
          getCsharpNullableElementTargetType(type) === integer, true);
        return { kind: "resolved", type };
      } } },
    }, input);
    assert.equal(getCsharpNullableElementTargetType(result) === integer && projections === (use === "callable" ? 1 : 0), true);
    if (use === "parameter-list") {
      assert.throws(() => bindCsharpSignatureParameterCapture(capture, { ...state, sourceStorageSubject: { ...incoming } }),
        /exact captured source subject/u);
    }
  }
});

test("synthetic signature retains every parameter Source before the first unavailable Native child", () => {
  const unit = fixture(2);
  const callable = { parameters: unit.parameters, result: { declaration: unit.owner, selectedType: {} } };
  const source = formCsharpCallableSignatureSource(unit.host.ast, callable, unit.queries,
    formCsharpCallableDeclaration(unit.owner, unit.sourceFile, unit.host.ast));
  const capture = formCsharpCallableSignatureCapture(unit.host, source);
  assert.equal(capture.parameters.length === 2 && capture.parameters.every((parameter, index) =>
    parameter.parameter === source.parameters[index].parameter && parameter.queries === unit.queries), true);
  assert.deepEqual(unit.observations, ["return", "input0", "input1"]);
  unit.host.ast = undefined;
  unit.host.sourceStorage = undefined;
  const state = { depth: 3, sourceBindings: new Map() };
  const input = bindCsharpCallableSignatureCapture(capture, state);
  const visited = [];
  const result = resolveFormedCsharpCallableDeclarationSignature({
    resolveFormedSignatureParameterEvidence(parameterSource) {
      assert.equal(parameterSource === input.parameters[0] && parameterSource.capture === capture.parameters[0] &&
        parameterSource.state === state, true, "the generator yields the same bound request, not a re-formed child");
      visited.push(parameterSource);
      return undefined;
    },
    resolveFormedSourceTypeComponentEvidence: () => assert.fail("the unavailable first parameter stops the Native return"),
    resolveNodeWithState: () => assert.fail("the unavailable first parameter stops Native constraints"),
  }, input);
  assert.equal(result === undefined && visited.length === 1, true);
  assert.deepEqual(unit.observations, ["return", "input0", "input1"]);
});

test("synthetic foreign, sparse or retired parameter inputs fail before children and keep projection rejection", () => {
  const unit = fixture();
  const capture = formCsharpSignatureParameterCapture(unit.host, unit.parameters[0], unit.queries, "callable", undefined);
  const state = { depth: 1 };
  const input = bindCsharpSignatureParameterCapture(capture, state);
  let children = 0;
  const scope = { resolveFormedSourceTypeComponentEvidence: () => { children += 1; return undefined; } };
  assert.throws(() => resolveFormedCsharpSignatureParameterEvidence(scope, unit.parameters[0], unit.queries, state, "callable"),
    /exact retained Source input/u);
  assert.throws(() => resolveFormedCsharpSignatureParameterEvidence(scope, { ...input,
    component: { ...input.component, capture: { ...capture.component } } }), /exact retained Source input/u);
  const callable = { parameters: unit.parameters, result: { declaration: unit.owner, selectedType: {} } };
  const source = formCsharpCallableSignatureSource(unit.host.ast, callable, unit.queries,
    formCsharpCallableDeclaration(unit.owner, unit.sourceFile, unit.host.ast));
  const signature = formCsharpCallableSignatureCapture(unit.host, source);
  const bound = bindCsharpCallableSignatureCapture(signature, state);
  for (const parameters of [new Array(1), [{ ...bound.parameters[0], state: { ...state } }]]) {
    assert.throws(() => resolveFormedCsharpCallableDeclarationSignature({
      resolveFormedSignatureParameterEvidence: () => { children += 1; return undefined; },
    }, { ...bound, parameters }), /exact ordered parameter Source/u);
  }
  assert.throws(() => bindCsharpCallableSignatureCapture({ ...signature, parameters: new Array(1) }, state),
    /exact ordered parameter captures/u);
  assert.equal(children === 0, true, "invalid Source associations never enter a Native child");
  const rejected = { kind: "rejected", subject: unit.declarations[0], code: "UNIT", reason: "synthetic projection rejection" };
  const rejections = [];
  const selected = bindCsharpSignatureParameterCapture(capture, { ...state, rejectNativeResolution: value => rejections.push(value) });
  const result = resolveFormedCsharpSignatureParameterEvidence({
    resolveFormedSourceTypeComponentEvidence: () => csharpSourcePrimitiveTargetType("int32"),
    host: { objectShapes: { resolveNativeParameter: () => rejected } },
  }, selected);
  assert.equal(result === undefined && rejections.length === 1 && rejections[0] === rejected, true);
});
