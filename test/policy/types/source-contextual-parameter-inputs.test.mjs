import assert from "node:assert/strict";
import test from "node:test";
import { formCsharpContextualParameterSource, resolveFormedCsharpContextualParameterCarrier } from "../../../dist/analysis/source-evidence/types/resolution/contextual-parameter-source.js";
import { bindCsharpCallableSignatureCapture } from "../../../dist/analysis/source-evidence/types/resolution/callable-signature-completion.js";
import { resolveFormedCsharpCallableEvidence } from "../../../dist/analysis/source-evidence/types/resolution/source-profiles.js";
import { csharpDelegateTargetType, getCsharpCallableValueSignature } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpSourcePrimitiveTargetType, csharpVoidTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

function fixture({ index = 0, rest = false, generic = false, argumentCount = 1, contextualKind = "selected" } = {}) {
  const declaration = { kind: "parameter" };
  const owner = { kind: "arrow" };
  const signatureDeclaration = { kind: "signature" };
  const ownParameter = { kind: "type-parameter", name: { text: "Own" }, start: 1 };
  const contextualParameter = { kind: "type-parameter", name: { text: "Context" }, start: 2 };
  const ownSource = {};
  const contextualType = {};
  const selectedReturn = {};
  const sourceFile = {};
  const callable = { parameters: [], result: { declaration: signatureDeclaration, selectedType: selectedReturn } };
  const contextual = { kind: contextualKind, component: { selectedType: contextualType } };
  const bindings = Array.from({ length: argumentCount }, () => ({ declaration: {}, argumentType: {} }));
  const declarations = [...Array.from({ length: index }, () => ({ kind: "parameter" })), declaration];
  const symbols = declarations.map(node => ({ declaration: node }));
  const returnSubject = { node: signatureDeclaration, kind: "return", projection: [] };
  const observations = [];
  const queries = { sourceFile, declarations: {
    declarationSignature(node) { assert.equal(node === owner, true); return owner; },
    signatureParameters: () => symbols,
    primarySymbolDeclaration: symbol => symbol.declaration,
    declaredType(node) { assert.equal(node === ownParameter, true); return ownSource; },
  }, types: {
    contextualValueSelection(node) { assert.equal(node === owner, true); observations.push("contextual"); return contextual; },
    callable(type) { assert.equal(type === contextualType, true); observations.push("callable"); return callable; },
    typeArgumentBindings(type) { assert.equal(type === contextualType, true); observations.push("arguments"); return bindings; },
  } };
  const host = { ast: {
    is: { IsParameterDeclaration: node => node?.kind === "parameter", IsArrowFunction: node => node === owner,
      IsFunctionExpression: () => false, IsTypeParameterDeclaration: node => node?.kind === "type-parameter",
      IsTypeAliasDeclaration: () => false, IsInterfaceDeclaration: () => false },
    as: { AsParameterDeclaration: () => rest ? { DotDotDotToken: {} } : {}, AsTypeParameterDeclaration: () => ({}) },
    parent: node => node === declaration ? owner : undefined,
    typeParameters: node => !generic ? [] : node === owner ? [ownParameter] : node === signatureDeclaration ? [contextualParameter] : [],
    name: node => node.name,
    text: node => node.text,
    getSourceFile: () => sourceFile,
    getPath: () => "/synthetic-contextual.ts",
    kind: () => 1,
    pos: node => node.start,
    end: node => node.start + 1,
  }, sourceStorage: { subject(node, kind) {
    assert.equal(node === signatureDeclaration && kind === "return", true);
    observations.push("return");
    return { kind: "resolved", subject: returnSubject };
  } } };
  const scope = { host, sourceValueDeclarationSyntax: () => ({}) };
  return { declaration, owner, signatureDeclaration, ownParameter, contextualParameter, ownSource,
    contextualType, callable, contextual, bindings, queries, host, scope, returnSubject, observations };
}

test("synthetic contextual capture precedes receiver children and binds each actual later state without Source queries", () => {
  const unit = fixture();
  const source = formCsharpContextualParameterSource(unit.scope, unit.declaration, unit.queries);
  assert.equal(source.kind === "contextual" && source.contextual === unit.contextual &&
    source.callable === unit.callable && source.arguments.bindings === unit.bindings &&
    source.signature.source.callable === unit.callable && !Object.hasOwn(source, "state"), true);
  assert.deepEqual(unit.observations, ["contextual", "callable", "arguments", "return"]);
  unit.host.ast = undefined;
  unit.queries.types = undefined;
  unit.queries.declarations = undefined;
  unit.scope.sourceValueDeclarationSyntax = () => assert.fail("Native completion must not repeat Source syntax");
  const integer = csharpSourcePrimitiveTargetType("int32");
  const nativeContract = csharpDelegateTargetType("System.Func", [integer], integer);
  const order = [];
  for (const depth of [2, 7]) {
    const originalOwner = {};
    const originalBinding = { sourceType: {}, targetType: integer };
    const sourceBindings = new Map([[originalOwner, originalBinding]]);
    const state = { depth, sourceBindings, sourceStorageSubject: {},
      rejectNativeResolution: () => assert.fail("synthetic leaves have no rejection") };
    const completed = resolveFormedCsharpContextualParameterCarrier({
      resolveTypeWithState(type, file, childState) {
        assert.equal(type === unit.bindings[0].argumentType && file === unit.queries.sourceFile &&
          childState.depth === depth + 2 && childState.sourceBindings === sourceBindings &&
          childState.rejectNativeResolution === state.rejectNativeResolution, true);
        order.push("argument");
        return integer;
      },
      resolveFormedCallableEvidence(input) {
        assert.equal(input.capture === source.signature && input.source.callable === unit.callable &&
          input.state.depth === depth + 1 && input.state.sourceBindings.get(originalOwner) === originalBinding &&
          input.state.sourceBindings.get(unit.bindings[0].declaration)?.targetType === integer &&
          input.state.sourceBindings.get(unit.bindings[0].declaration)?.sourceType === unit.bindings[0].argumentType, true);
        assert.equal(input.state.sourceStorageSubject === state.sourceStorageSubject &&
          input.returnState.sourceStorageSubject === unit.returnSubject &&
          input.returnState.sourceBindings === input.state.sourceBindings, true);
        order.push("signature");
        return nativeContract;
      },
    }, source, state);
    assert.equal(completed.kind === "resolved" && completed.type === integer, true);
  }
  assert.deepEqual(order, ["argument", "signature", "argument", "signature"]);
  assert.deepEqual(unit.observations, ["contextual", "callable", "arguments", "return"]);
});

test("synthetic contextual binding keeps all-child failure and the original authored binding after receiver arguments", () => {
  const unit = fixture({ argumentCount: 2 });
  const source = formCsharpContextualParameterSource(unit.scope, unit.declaration, unit.queries);
  const visited = [];
  const integer = csharpSourcePrimitiveTargetType("int32");
  const missing = resolveFormedCsharpContextualParameterCarrier({
    resolveTypeWithState(type) { visited.push(type); return visited.length === 1 ? undefined : integer; },
    resolveFormedCallableEvidence: () => assert.fail("an unavailable receiver argument stops the signature"),
  }, source, { depth: 3 });
  assert.equal(missing.kind === "unresolved", true);
  assert.deepEqual(visited, unit.bindings.map(binding => binding.argumentType));
  const authored = fixture({ generic: true });
  const selected = formCsharpContextualParameterSource(authored.scope, authored.declaration, authored.queries);
  assert.equal(selected.authored.parameters[0] === authored.ownParameter &&
    selected.authored.contextualParameters[0] === authored.contextualParameter &&
    selected.authored.sources[0] === authored.ownSource &&
    selected.authored.targets[0].csharpDeclaration === authored.ownParameter, true);
  const order = [];
  const result = resolveFormedCsharpContextualParameterCarrier({
    resolveTypeWithState: () => { order.push("argument"); return integer; },
    resolveFormedCallableEvidence(input) {
      assert.equal(input.state.sourceBindings.get(authored.contextualParameter)?.sourceType === authored.ownSource &&
        input.state.sourceBindings.get(authored.contextualParameter)?.targetType === selected.authored.targets[0], true);
      order.push("signature");
      return csharpDelegateTargetType("System.Func", [integer], integer);
    },
  }, selected, { depth: 3 });
  assert.equal(result.kind === "resolved" && result.type === integer, true);
  assert.deepEqual(order, ["argument", "signature"]);
  const mismatch = { ...selected, authored: { ...selected.authored, contextualParameters: [] } };
  const rejected = resolveFormedCsharpContextualParameterCarrier({
    resolveTypeWithState: () => { order.push("mismatch-argument"); return integer; },
    resolveFormedCallableEvidence: () => assert.fail("the original authored arity mismatch stops the signature"),
  }, mismatch, { depth: 3 });
  assert.equal(rejected.kind === "unresolved", true);
  assert.deepEqual(order, ["argument", "signature", "mismatch-argument"]);
});

test("synthetic contextual rest selection keeps tuple grouping and the original rest value projection", () => {
  const integer = csharpSourcePrimitiveTargetType("int32");
  const text = csharpSourcePrimitiveTargetType("string");
  const array = { kind: "array", element: text };
  for (const row of [
    { index: 1, rest: true, contract: csharpDelegateTargetType("System.Action", [integer, text]), kind: "tuple" },
    { index: 1, rest: true, contract: csharpDelegateTargetType("System.Action", [integer, array], undefined, { restParameterIndex: 1 }), type: array },
    { index: 2, rest: true, contract: csharpDelegateTargetType("System.Action", [integer, array], undefined, { restParameterIndex: 1 }), kind: "unresolved" },
    { index: 2, rest: false, contract: csharpDelegateTargetType("System.Action", [integer, array], undefined, { restParameterIndex: 1 }), type: text },
  ]) {
    const unit = fixture({ index: row.index, rest: row.rest, argumentCount: 0 });
    const source = formCsharpContextualParameterSource(unit.scope, unit.declaration, unit.queries);
    const result = resolveFormedCsharpContextualParameterCarrier({
      resolveTypeWithState: () => assert.fail("the synthetic receiver has no type arguments"),
      resolveFormedCallableEvidence: () => row.contract,
    }, source, { depth: 4 });
    if (row.kind === "tuple") {
      assert.equal(result.kind === "resolved" && result.type.kind === "tuple" &&
        result.type.elements.length === 1 && result.type.elements[0] === text, true);
    } else if (row.kind === "unresolved") {
      assert.equal(result.kind === "unresolved", true);
    } else {
      assert.equal(result.kind === "resolved" && result.type === row.type, true);
    }
  }
});

test("synthetic contextual eligibility and foreign Source associations are refused before Native children", () => {
  const unit = fixture({ contextualKind: "ambiguous" });
  const ambiguous = formCsharpContextualParameterSource(unit.scope, unit.declaration, unit.queries);
  assert.equal(ambiguous.kind === "unresolved", true);
  assert.deepEqual(unit.observations, ["contextual"]);
  const annotated = fixture();
  annotated.scope.sourceValueDeclarationSyntax = () => ({ type: {} });
  const absent = formCsharpContextualParameterSource(annotated.scope, annotated.declaration, annotated.queries);
  assert.equal(absent.kind === "not-applicable", true);
  assert.deepEqual(annotated.observations, []);
  let children = 0;
  const scope = { resolveTypeWithState: () => { children += 1; return undefined; },
    resolveFormedCallableEvidence: () => { children += 1; return undefined; } };
  assert.equal(resolveFormedCsharpContextualParameterCarrier(scope, ambiguous, { depth: 0 }).kind === "unresolved", true);
  assert.equal(resolveFormedCsharpContextualParameterCarrier(scope, absent, { depth: 0 }).kind === "not-applicable", true);
  const selected = fixture();
  const source = formCsharpContextualParameterSource(selected.scope, selected.declaration, selected.queries);
  assert.throws(() => resolveFormedCsharpContextualParameterCarrier(scope, selected.declaration, { depth: 0 }), /retained Source input/u);
  assert.throws(() => resolveFormedCsharpContextualParameterCarrier(scope, { ...source,
    arguments: { ...source.arguments, queries: { ...source.queries } } }, { depth: 0 }), /exact retained Source selection/u);
  assert.throws(() => resolveFormedCsharpContextualParameterCarrier(scope, { ...source,
    signature: { ...source.signature, source: { ...source.signature.source, callable: {} } } }, { depth: 0 }), /exact retained Source selection/u);
  assert.equal(children === 0, true, "absent, ambiguous, removed or foreign inputs never enter a Native child");
});

test("synthetic formed callable evidence consumes the retained return before the actual ABI owner", () => {
  const unit = fixture({ argumentCount: 0 });
  const source = formCsharpContextualParameterSource(unit.scope, unit.declaration, unit.queries);
  const state = { depth: 5, sourceBindings: new Map() };
  const input = bindCsharpCallableSignatureCapture(source.signature, state);
  const order = [];
  unit.host.ast = undefined;
  unit.queries.types = undefined;
  unit.queries.declarations = undefined;
  const result = resolveFormedCsharpCallableEvidence({
    host: { projectTypeCatalog: { genericProjections(declaration) {
      assert.equal(declaration === unit.signatureDeclaration, true);
      order.push("ABI");
      return [];
    } }, objectShapes: { resolveCallableValue: () => assert.fail("the explicit synthetic monomorphic ABI has no projections") } },
    resolveSignatureParameterEvidence: () => assert.fail("the explicit synthetic signature has no parameter children"),
    resolveFormedSourceTypeComponentEvidence(resultSource) {
      assert.equal(resultSource === input.resultSource && resultSource.capture === source.signature.result &&
        resultSource.inputState === input.returnState, true);
      order.push("return");
      return csharpVoidTargetType();
    },
    resolveNodeWithState: () => assert.fail("the explicit synthetic signature has no constraint children"),
  }, input);
  const signature = getCsharpCallableValueSignature(result);
  assert.equal(signature !== undefined && signature.parameters.length === 0, true);
  assert.deepEqual(order, ["return", "ABI"]);
});
