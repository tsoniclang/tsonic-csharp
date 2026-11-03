import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpSourceValueDeclarationSource } from "../../../dist/analysis/source-evidence/types/resolution/value-source.js";
import { formCsharpSelectedValueSource, resolveFormedCsharpSelectedValueResult } from "../../../dist/analysis/source-evidence/types/resolution/selected-value-source.js";
import { csharpSourceValueResult } from "../../../dist/analysis/source-evidence/types/resolution/call-results.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";

function fixture(binding = false) {
  const unit = { node: {}, declaration: binding ? { kind: "binding" } : undefined, file: {}, selectedType: {},
    declaredType: undefined, scoped: undefined, valueResult: undefined, parent: undefined,
    observations: [], nativeReads: [] };
  unit.subject = {};
  unit.storage = { kind: "resolved", subject: unit.subject };
  unit.reference = unit.declaration === undefined ? undefined : { declaration: unit.declaration };
  unit.queries = { sourceFile: unit.file, declarations: {
    declaredValueType(declaration) {
      assert.equal(declaration === unit.declaration, true);
      unit.observations.push("declared-type");
      return unit.declaredType;
    },
  }, types: {
    expressionType(node) {
      assert.equal(node === unit.node, true);
      unit.observations.push("expression-type");
      return unit.selectedType;
    },
    refinement(declared, selected) {
      assert.equal(declared === unit.selectedType && selected === unit.selectedType, true);
      unit.observations.push("refinement");
      return { kind: "exact" };
    },
    isUnion: () => false, isNonPrimitive: () => false, relationship: () => "identical", isNullish: () => false,
  } };
  unit.host = { ast: {
    getSourceFile: () => unit.file, parent: node => node === unit.node ? unit.parent : undefined,
    kindName: node => node?.kind === "typeof" ? "KindTypeOfExpression" : "unit-node",
    is: { IsBindingElement: node => node === unit.declaration && binding, IsParameterDeclaration: () => false,
      IsPropertyAccessExpression: () => false, IsElementAccessExpression: () => false,
      IsParenthesizedExpression: () => false, IsSatisfiesExpression: () => false,
      IsTypeOfExpression: node => node?.kind === "typeof" },
  }, navigation: { referenceFor(node) {
    assert.equal(node === unit.node, true);
    unit.observations.push("reference");
    return unit.reference;
  } }, sourceStorage: { subjectFor(node) {
    assert.equal(node === unit.node, true);
    unit.observations.push("storage");
    return unit.storage;
  } }, representations: { scopedTargetType() {
    unit.nativeReads.push("scoped");
    return unit.scoped;
  } }, bindingProjection(declaration, file) {
    assert.equal(declaration === unit.declaration && file === unit.file, true);
    unit.nativeReads.push("binding");
    return undefined;
  }, structuralTypes: { resolveTarget: () => undefined } };
  unit.scope = { host: unit.host,
    sourceValueDeclaration(node, declaration) {
      assert.equal(node === unit.node && declaration === unit.declaration, true);
      unit.observations.push("selection");
      return declaration;
    },
    sourceValueDeclarationSyntax(declaration) {
      assert.equal(declaration === unit.declaration, true);
      unit.observations.push("syntax");
      return { type: undefined, initializer: undefined };
    },
    sourceCallSelectedDeclaration: () => assert.fail("these synthetic value leaves have no call"),
    resolveFormedSourceValueResult(source) {
      assert.equal(source === unit.source.value, true, "the existing child consumes the retained value occurrence");
      unit.nativeReads.push("value");
      return unit.valueResult;
    },
    resolveNodeValueWithState(node, file, state) {
      assert.equal(node === unit.node && file === unit.file, true);
      assert.equal(state.depth === unit.state.depth + 1 && state.sourceStorageSubject === unit.subject, true);
      assert.equal(state.sourceBindings === unit.state.sourceBindings && state.sourceStorageBindings === unit.state.sourceStorageBindings, true);
      assert.equal(state.rejectNativeResolution === unit.state.rejectNativeResolution, true);
      unit.nativeReads.push("node");
      return unit.valueResult;
    },
    resolveNodeWithState: () => assert.fail("unexpected Native declaration child for these synthetic leaves"),
    resolveTypeWithState: () => assert.fail("unexpected Native selected fallback for these synthetic leaves"),
    resolveMemberAccessTargetType: () => assert.fail("these synthetic leaves have no member access"),
  };
  unit.state = { depth: 7, sourceBindings: new Map(), sourceStorageBindings: {}, sourceStorageSubject: {},
    rejectNativeResolution: () => assert.fail("these synthetic leaves have no rejection") };
  return unit;
}

function capture(unit) {
  const selection = formCsharpSourceValueDeclarationSource(unit.scope, unit.node);
  unit.source = formCsharpSelectedValueSource(unit.scope, selection, unit.selectedType, unit.queries, unit.state);
  return unit.source;
}

function forbidSource(unit) {
  unit.host.ast = undefined;
  unit.host.navigation = undefined;
  unit.host.sourceStorage = undefined;
  for (const family of [unit.queries.types, unit.queries.declarations]) {
    for (const key of Object.keys(family)) family[key] = () => assert.fail("this formed synthetic branch cannot read Source again");
  }
  unit.scope.sourceValueDeclaration = () => assert.fail("formed completion cannot select the declaration again");
  unit.scope.sourceValueDeclarationSyntax = () => assert.fail("formed completion cannot read syntax again");
}

test("synthetic selected value retains its checked occurrence and H0 state before the Native child", () => {
  const unit = fixture();
  const source = capture(unit);
  assert.equal(source.selection.node === unit.node && source.selection.declaration === undefined, true);
  assert.equal(source.queries === unit.queries && source.sourceFile === unit.file && source.selectedType === unit.selectedType, true);
  assert.equal(source.inputState === unit.state && source.storage === unit.storage, true);
  assert.equal(source.state.sourceStorageSubject === unit.subject && source.state.depth === unit.state.depth, true);
  assert.equal(source.value.selection === source.selection && source.value.state === source.valueState, true);
  assert.equal(source.valueState.depth === unit.state.depth + 1 && source.value.selectedType === unit.selectedType, true);
  assert.equal(unit.nativeReads.length, 0);
  const receipt = csharpSourceValueResult(csharpSourcePrimitiveTargetType("int64"));
  unit.valueResult = receipt;
  forbidSource(unit);
  assert.equal(resolveFormedCsharpSelectedValueResult(unit.scope, source) === receipt, true);
  assert.deepEqual(unit.nativeReads, ["scoped", "scoped", "node"]);
});

test("synthetic selected binding keeps presence use and the original typeof nullable decision", () => {
  const unit = fixture(true);
  unit.declaredType = unit.selectedType;
  const payload = csharpSourcePrimitiveTargetType("int64");
  unit.scoped = csharpNullableTargetType(payload);
  const source = capture(unit);
  assert.equal(source.declared.type === unit.selectedType && source.declared.bindingPresent, true);
  forbidSource(unit);
  assert.equal(resolveFormedCsharpSelectedValueResult(unit.scope, source)?.selectedType === payload, true);
  assert.deepEqual(unit.nativeReads, ["scoped"]);

  const guarded = fixture(true);
  guarded.declaredType = guarded.selectedType;
  guarded.parent = { kind: "typeof" };
  guarded.scoped = csharpNullableTargetType(payload);
  const guardedSource = capture(guarded);
  const guardedReceipt = csharpSourceValueResult(guarded.scoped);
  guarded.valueResult = guardedReceipt;
  assert.equal(guardedSource.declared.bindingPresent, false);
  forbidSource(guarded);
  assert.equal(resolveFormedCsharpSelectedValueResult(guarded.scope, guardedSource) === guardedReceipt, true);
  assert.deepEqual(guarded.nativeReads, ["scoped", "value"]);
});

test("synthetic selected declaration preserves the unavailable value stop without a fallback child", () => {
  const unit = fixture(true);
  const source = capture(unit);
  assert.equal(source.value.kind === "binding" && source.declared === undefined && source.member === false, true);
  assert.equal(source.value.selection === source.selection && source.value.selectedType === unit.selectedType, true);
  forbidSource(unit);
  assert.equal(resolveFormedCsharpSelectedValueResult(unit.scope, source) === undefined, true);
  assert.deepEqual(unit.nativeReads, ["scoped", "scoped", "binding", "value"]);
});

test("synthetic selected value rejects retired, foreign and rebound packets before Native children", () => {
  const unit = fixture();
  const source = capture(unit);
  forbidSource(unit);
  assert.throws(() => formCsharpSelectedValueSource(unit.scope, unit.node, unit.selectedType, unit.queries, unit.state), /retained declaration selection/);
  assert.throws(() => resolveFormedCsharpSelectedValueResult(unit.scope, unit.node), /exact retained declaration/);
  assert.throws(() => resolveFormedCsharpSelectedValueResult(unit.scope, { ...source, selection: { ...source.selection } }), /exact retained declaration/);
  assert.throws(() => resolveFormedCsharpSelectedValueResult(unit.scope, { ...source, value: { ...source.value, queries: {} } }), /exact retained declaration/);
  assert.throws(() => resolveFormedCsharpSelectedValueResult(unit.scope, { ...source, valueState: { ...source.valueState } }), /exact retained declaration/);
  assert.throws(() => resolveFormedCsharpSelectedValueResult(unit.scope, { ...source, state: { ...source.state, sourceBindings: new Map() } }), /exact retained declaration/);
  assert.throws(() => resolveFormedCsharpSelectedValueResult(unit.scope, { ...source, state: { ...source.state, sourceStorageSubject: {} } }), /exact retained declaration/);
  assert.throws(() => resolveFormedCsharpSelectedValueResult(unit.scope, { ...source, sourceFile: {} }), /exact retained declaration/);
  assert.equal(unit.nativeReads.length, 0);
});
