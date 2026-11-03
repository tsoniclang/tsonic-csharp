import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpCallableDeclaration } from "../../../dist/analysis/source-evidence/types/resolution/callable-type-parameters.js";
import { formCsharpCallableSignatureSource } from "../../../dist/analysis/source-evidence/types/resolution/callable-signature-source.js";
import { formCsharpCallableSignatureInput, completeCsharpCallableSignatureSource } from "../../../dist/analysis/source-evidence/types/resolution/callable-signature-completion.js";
import { resolveFormedCsharpCallableDeclarationSignature, resolveFormedCsharpSourceTypeComponentEvidence } from "../../../dist/analysis/source-evidence/types/resolution/source-profiles.js";
import { resolveFormedCsharpSourceTypeComponent } from "../../../dist/analysis/source-evidence/types/resolution/type-component-source.js";
import { csharpSourcePrimitiveTargetType, csharpVoidTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpRuntimeLocationTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";

function fixture() {
  const declaration = {};
  const checkedReturn = {};
  const queries = { sourceFile: {} };
  const subject = { node: declaration, kind: "return", projection: [] };
  const state = { depth: 6, sourceBindings: new Map() };
  const order = [];
  const host = {
    ast: { typeParameters: () => [], is: { IsTypeAliasDeclaration: () => false,
      IsInterfaceDeclaration: () => false, IsTypeParameterDeclaration: () => false } },
    sourceStorage: { subject(actual, kind) {
      assert.equal(actual === declaration && kind === "return", true, "the exact selected declaration owns the Source return input");
      order.push("Source:return");
      return { kind: "resolved", subject };
    } },
  };
  const callable = { parameters: [{ type: {}, parameterKind: "required", omissionKind: "required", acceptsOmission: false }],
    result: { declaration, selectedType: checkedReturn } };
  const source = formCsharpCallableSignatureSource(host.ast, callable, queries,
    formCsharpCallableDeclaration(declaration, queries.sourceFile, host.ast));
  const input = formCsharpCallableSignatureInput(host, source, state);
  return { declaration, checkedReturn, queries, subject, state, order, host, source, input };
}

test("synthetic return Source is retained before parameters and consumed without a late Source query", () => {
  const unit = fixture();
  const resultSource = unit.input.resultSource;
  assert.equal(resultSource.component === unit.source.callable.result && resultSource.queries === unit.queries &&
    resultSource.inputState === unit.input.returnState && resultSource.state.sourceStorageSubject === unit.subject, true);
  assert.deepEqual(unit.order, ["Source:return"]);
  unit.host.sourceStorage.subject = () => assert.fail("Native signature completion must not re-form return Source");
  unit.host.ast = undefined;
  const integer = csharpSourcePrimitiveTargetType("int32");
  const voidType = csharpVoidTargetType();
  const completed = resolveFormedCsharpCallableDeclarationSignature({
    resolveSignatureParameterEvidence(parameter, queries, state) {
      assert.equal(parameter === unit.source.parameters[0].parameter && queries === unit.queries && state === unit.state, true);
      unit.order.push("parameter");
      return integer;
    },
    resolveFormedSourceTypeComponentEvidence(source) {
      assert.equal(source === resultSource, true, "the Native return receives the same before-child Source packet");
      return resolveFormedCsharpSourceTypeComponentEvidence({
        resolvePointerReturn(declaration, state) {
          assert.equal(declaration === unit.declaration && state === resultSource.state, true);
          unit.order.push("pointer");
          return undefined;
        },
        resolveTypeWithState(type, file, state) {
          assert.equal(type === unit.checkedReturn && file === unit.queries.sourceFile && state === resultSource.childState &&
            state.sourceBindings === unit.state.sourceBindings, true);
          unit.order.push("checked");
          return voidType;
        },
      }, source);
    },
    resolveNodeWithState: () => assert.fail("the explicit synthetic monomorphic declaration has no constraint child"),
  }, unit.input);
  assert.equal(completed?.input === unit.input && completed.result.request.source === resultSource &&
    completed.result.type === voidType, true, "one signature driver keeps the exact result request and reply");
  assert.deepEqual(unit.order, ["Source:return", "parameter", "pointer", "checked"]);
});

test("synthetic first unavailable parameter stops Native return children but not the earlier Source capture", () => {
  const unit = fixture();
  const completed = resolveFormedCsharpCallableDeclarationSignature({
    resolveSignatureParameterEvidence: () => { unit.order.push("parameter"); return undefined; },
    resolveFormedSourceTypeComponentEvidence: () => assert.fail("an unavailable first parameter stops every Native return child"),
    resolveNodeWithState: () => assert.fail("an unavailable first parameter stops constraints"),
  }, unit.input);
  assert.equal(completed === undefined, true, "no native signature is invented from a missing child");
  assert.deepEqual(unit.order, ["Source:return", "parameter"]);
});

test("synthetic foreign or retired return inputs fail before children and return replies need their exact request", () => {
  const unit = fixture();
  let children = 0;
  const scope = { resolveSignatureParameterEvidence: () => { children += 1; return undefined; } };
  for (const resultSource of [
    { ...unit.input.resultSource, component: {} },
    { ...unit.input.resultSource, queries: { ...unit.queries } },
    { ...unit.input.resultSource, inputState: { ...unit.input.returnState } },
  ]) {
    assert.throws(() => resolveFormedCsharpCallableDeclarationSignature(scope, { ...unit.input, resultSource }),
      /exact retained return Source/u);
  }
  assert.throws(() => resolveFormedCsharpCallableDeclarationSignature(scope, unit.source, unit.state), /exact retained return Source/u);
  assert.equal(children === 0, true, "the removed raw API and foreign associations never enter Native children");
  const completion = completeCsharpCallableSignatureSource(unit.input);
  const first = completion.next();
  const next = completion.next({ kind: "parameter", request: first.value, type: csharpSourcePrimitiveTargetType("int32") });
  assert.equal(next.done === false && next.value.kind === "result" && next.value.source === unit.input.resultSource, true);
  assert.throws(() => completion.next({ kind: "result", request: { ...next.value }, type: csharpVoidTargetType() }),
    /exact return dependency/u);
});

test("synthetic formed full completion keeps pointer-first while the checked-only capability never probes a body", () => {
  const unit = fixture();
  const source = unit.input.resultSource;
  const integer = csharpSourcePrimitiveTargetType("int32");
  const pointer = csharpRuntimeLocationTargetType(integer);
  const selected = resolveFormedCsharpSourceTypeComponentEvidence({
    resolvePointerReturn: () => ({ type: pointer, undefinedReturn: false, fallthroughUndefined: false }),
    resolveTypeWithState: () => assert.fail("the selected pointer prevents checked Native completion"),
  }, source);
  assert.equal(selected === pointer, true);
  const order = [];
  const fallback = resolveFormedCsharpSourceTypeComponentEvidence({
    resolvePointerReturn: () => { order.push("pointer"); return undefined; },
    resolveTypeWithState: () => { order.push("checked"); return integer; },
  }, source);
  assert.equal(fallback === integer, true);
  assert.deepEqual(order, ["pointer", "checked"]);
  const checked = resolveFormedCsharpSourceTypeComponent({
    resolvePointerReturn: () => assert.fail("the separate checked-only capability must never probe a body"),
    resolveTypeWithState: () => integer,
  }, source);
  assert.equal(checked === integer, true);
});
