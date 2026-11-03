import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpSourceTypeComponentCapture, bindCsharpSourceTypeComponentCapture,
  resolveFormedCsharpSourceTypeComponent } from "../../../dist/analysis/source-evidence/types/resolution/type-component-source.js";
import { formCsharpCallableSignatureCapture, bindCsharpCallableSignatureCapture,
  completeCsharpCallableSignatureSource } from "../../../dist/analysis/source-evidence/types/resolution/callable-signature-completion.js";
import { formCsharpCallableSignatureSource } from "../../../dist/analysis/source-evidence/types/resolution/callable-signature-source.js";
import { formCsharpCallableDeclaration } from "../../../dist/analysis/source-evidence/types/resolution/callable-type-parameters.js";
import { csharpSourcePrimitiveTargetType, csharpVoidTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

function fixture() {
  const declaration = {};
  const selectedType = {};
  const queries = { sourceFile: {} };
  const subject = { node: declaration, kind: "return", projection: [] };
  const observations = [];
  const host = { ast: { typeParameters: () => [], is: { IsTypeAliasDeclaration: () => false,
    IsInterfaceDeclaration: () => false, IsTypeParameterDeclaration: () => false } }, sourceStorage: {
    storageSubjectFor(node) {
      assert.equal(node === declaration, true, "the original declaration owns its checked storage normalization");
      observations.push("storage");
      return { kind: "resolved", subject };
    },
    subject(node, kind) {
      assert.equal(node === declaration && kind === "return", true, "the actual return owner is retained");
      observations.push("return");
      return { kind: "resolved", subject };
    },
  } };
  const component = { declaration, selectedType };
  return { declaration, selectedType, queries, subject, observations, host, component };
}

test("synthetic semantic component capture binds each actual state without repeating Source observations", () => {
  const unit = fixture();
  const capture = formCsharpSourceTypeComponentCapture({ host: unit.host }, unit.component, unit.queries, undefined);
  assert.equal(capture.component === unit.component && capture.queries === unit.queries &&
    capture.storage.subject === unit.subject && !Object.hasOwn(capture, "state"), true);
  unit.host.sourceStorage.storageSubjectFor = () => assert.fail("pure component binding must not query Source again");
  unit.host.ast = undefined;
  const integer = csharpSourcePrimitiveTargetType("int32");
  for (const depth of [2, 7]) {
    const sourceBindings = new Map([[{}, { sourceType: {}, targetType: integer }]]);
    const rejection = () => assert.fail("synthetic checked children have no rejection");
    const state = { depth, sourceBindings, rejectNativeResolution: rejection };
    const bound = bindCsharpSourceTypeComponentCapture(capture, state);
    assert.equal(bound.capture === capture && bound.inputState === state && bound.component === unit.component &&
      bound.queries === unit.queries && bound.state.sourceStorageSubject === unit.subject, true);
    assert.equal(bound.childState.depth === depth + 1 && bound.childState.sourceBindings === sourceBindings &&
      bound.childState.rejectNativeResolution === rejection, true, "no default state, depth or binding map replaces the actual caller");
    const completed = resolveFormedCsharpSourceTypeComponent({ resolveTypeWithState(type, file, childState) {
      assert.equal(type === unit.selectedType && file === unit.queries.sourceFile && childState === bound.childState, true);
      return integer;
    } }, bound);
    assert.equal(completed === integer, true);
  }
  assert.deepEqual(unit.observations, ["storage"]);
});

test("synthetic authored component keeps the exact capture and binds child requests to the later state", () => {
  const unit = fixture();
  const authoredTypeNode = {};
  unit.component.authoredTypeNode = authoredTypeNode;
  unit.host.ast.getSourceFile = node => {
    assert.equal(node === authoredTypeNode, true);
    return unit.queries.sourceFile;
  };
  unit.host.hasSemantics = () => { unit.observations.push("authored"); return false; };
  const capture = formCsharpSourceTypeComponentCapture({ host: unit.host }, unit.component, unit.queries, unit.subject);
  assert.equal(capture.checked.kind === "authored" && capture.checked.source.authoredTypeNode === authoredTypeNode, true);
  unit.host.hasSemantics = () => assert.fail("pure authored binding must not repeat the checked selection");
  const sourceBindings = new Map();
  const state = { depth: 4, sourceBindings, sourceStorageSubject: unit.subject };
  const bound = bindCsharpSourceTypeComponentCapture(capture, state);
  assert.equal(bound.checked.kind === "authored" && bound.checked.source.source === capture.checked.source &&
    bound.checked.source.inputState === bound.childState && bound.checked.source.state.sourceBindings === sourceBindings, true);
  assert.equal(bound.checked.source.dependencies.selected.type === unit.selectedType &&
    bound.checked.source.dependencies.selected.state.depth === state.depth + 2 &&
    bound.checked.source.dependencies.selected.state.sourceBindings === sourceBindings, true,
    "the original authored-selection child depth and actual bindings are preserved");
  assert.deepEqual(unit.observations, ["authored"]);
});

test("synthetic signature capture keeps one return H0 and binds the actual later caller states", () => {
  const unit = fixture();
  const callable = { parameters: [], result: unit.component };
  const source = formCsharpCallableSignatureSource(unit.host.ast, callable, unit.queries,
    formCsharpCallableDeclaration(unit.declaration, unit.queries.sourceFile, unit.host.ast));
  const capture = formCsharpCallableSignatureCapture(unit.host, source);
  assert.equal(capture.source === source && capture.returnSubject === unit.subject &&
    capture.result.component === callable.result && !Object.hasOwn(capture, "state"), true);
  unit.host.sourceStorage.subject = () => assert.fail("pure signature binding must not query return H0 again");
  unit.host.sourceStorage.storageSubjectFor = () => assert.fail("pure signature binding must not normalize Source again");
  unit.host.ast = undefined;
  for (const depth of [1, 8]) {
    const state = { depth, sourceBindings: new Map(), sourceStorageSubject: {},
      rejectNativeResolution: () => assert.fail("explicit synthetic monomorphic leaves have no refusal") };
    const input = bindCsharpCallableSignatureCapture(capture, state);
    assert.equal(input.capture === capture && input.source === source && input.state === state &&
      input.resultSource.capture === capture.result && input.resultSource.inputState === input.returnState, true);
    assert.equal(input.returnState.sourceStorageSubject === unit.subject && input.returnState.depth === depth &&
      input.returnState.sourceBindings === state.sourceBindings &&
      input.returnState.rejectNativeResolution === state.rejectNativeResolution, true,
      "only the original return subject override changes the actual caller state");
    const completion = completeCsharpCallableSignatureSource(input);
    const first = completion.next();
    assert.equal(first.done === false && first.value.kind === "result" && first.value.source === input.resultSource, true);
    const last = completion.next({ kind: "result", request: first.value, type: csharpVoidTargetType() });
    assert.equal(last.done === true && last.value?.input === input && last.value.state === state, true);
  }
  assert.deepEqual(unit.observations, ["return"]);
});

test("synthetic state binding rejects a different subject or foreign capture before Native children", () => {
  const unit = fixture();
  const capture = formCsharpSourceTypeComponentCapture({ host: unit.host }, unit.component, unit.queries, unit.subject);
  const state = { depth: 2, sourceStorageSubject: unit.subject };
  assert.throws(() => bindCsharpSourceTypeComponentCapture(capture,
    { ...state, sourceStorageSubject: { ...unit.subject } }), /exact captured source subject/u);
  assert.throws(() => bindCsharpSourceTypeComponentCapture({ ...capture, checked: { ...capture.checked, type: {} } }, state),
    /exact captured selection/u);
  const bound = bindCsharpSourceTypeComponentCapture(capture, state);
  let children = 0;
  assert.throws(() => resolveFormedCsharpSourceTypeComponent({ resolveTypeWithState: () => { children += 1; return undefined; } },
    { ...bound, capture: undefined }), /exact retained Source capture/u);
  const callable = { parameters: [], result: unit.component };
  const source = formCsharpCallableSignatureSource(unit.host.ast, callable, unit.queries,
    formCsharpCallableDeclaration(unit.declaration, unit.queries.sourceFile, unit.host.ast));
  const signature = formCsharpCallableSignatureCapture(unit.host, source);
  assert.throws(() => bindCsharpCallableSignatureCapture({ ...signature, returnSubject: { ...unit.subject } }, state),
    /exact captured return input/u);
  const input = bindCsharpCallableSignatureCapture(signature, state);
  assert.throws(() => completeCsharpCallableSignatureSource({ ...input,
    resultSource: { ...input.resultSource, capture: { ...signature.result } } }).next(), /exact retained return Source/u);
  assert.equal(children === 0, true, "invalid capture or state association never reaches a Native child");
});
