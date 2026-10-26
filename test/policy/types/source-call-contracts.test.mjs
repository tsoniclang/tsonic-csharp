import assert from "node:assert/strict";
import test from "node:test";
import { resolveSourceCallContract } from "../../../dist/analysis/source-evidence/types/resolution/call-contracts.js";
import { resolveSourceCallParameter, resolveSourceCallParameters, resolveSourceCallArgumentParameter, resolveSourceCallResultWithState, resolveSourceCallTypeArguments } from "../../../dist/analysis/source-evidence/types/resolution/call-api.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { retainCsharpGenericCallableValue } from "../../../dist/analysis/callables/generic-values.js";
import { substituteTargetTypeParameters } from "../../../dist/policy/types/resolution/substitution.js";
import { csharpFreeTypeParameterIdentities } from "../../../dist/target-model/types/generic-references.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { sourceCallableTypeParametersMatch, resolveSourceCallReceiverTargetType, resolveSourceCallInstantiation, inferSourceCallTargetTypeArguments } from "../../../dist/analysis/source-evidence/types/resolution/calls.js";
import { csharpProjectedType } from "../../../dist/target-model/types/projections.js";
import { csharpSourceTypeParameter } from "../../../dist/source/extension/type-parameters.js";
import { selectSourceCallParameterSlots } from "../../../../tsonic/packages/target-api/dist/source-semantics/call-parameter-slots.js";
import { resolveCallableEvidence } from "../../../dist/analysis/source-evidence/types/resolution/source-profiles.js";
import { createCsharpTypeParameterEnvironment } from "../../../dist/analysis/source-evidence/types/resolution/type-parameter-environment.js";
import { instantiateCsharpObjectShape } from "../../../dist/policy/types/objects/instantiation.js";
import { csharpMethodValueType } from "../../../dist/target-model/types/method-values.js";

const integer = { kind: "source-primitive", name: "int64" };
const string = { kind: "source-primitive", name: "string" };
const outer = { kind: "type-parameter", identity: "outer:Item", name: "Item" };

test("independent checked arguments infer native destinations before the body ABI without self-authorizing an array", () => {
  const selectedParameter = { kind: "type-parameter", identity: "checked:Item", name: "Item" };
  const nativeParameter = { kind: "type-parameter", identity: "native:Item", name: "Item" };
  const floating = { kind: "source-primitive", name: "float64" };
  const sampleType = {};
  const valuesType = {};
  const sample = {};
  const values = {};
  const file = {};
  const source = { sourceArguments: [{ expression: sample }, { expression: values }],
    sourceSelectedSignatureParameters: [
      { parameterName: "sample", authoredTypeNode: sampleType, rest: false },
      { parameterName: "values", authoredTypeNode: valuesType, rest: false },
    ], sourceArgumentBindings: [0, 1].map(index => ({ sourceArgumentIndex: index,
      effectiveArgumentIndex: index, sourceParameterIndex: index, sourceForm: "value" })) };
  let originalQueries = 0;
  const scope = { host: { ast: { getSourceFile: node => node === sampleType || node === valuesType ? file : undefined,
    is: { IsArrowFunction: () => false, IsFunctionExpression: () => false, IsParenthesizedExpression: () => false,
      IsSatisfiesExpression: () => false, IsArrayLiteralExpression: () => false, IsObjectLiteralExpression: () => false } },
    literalValues: { literalValue: { get: () => undefined } },
    semantics: () => ({ types: { expressionType: node => {
      assert.equal(node === sample, true, "the same array cannot participate in its independent destination proof");
      return {};
    } } }) },
    resolveNodeWithState: node => {
      originalQueries++;
      return node === sampleType ? selectedParameter : { kind: "array", element: selectedParameter };
    }, resolveSelectedValueWithState: () => floating };
  const excluded = new Set([1]);
  const selected = inferSourceCallTargetTypeArguments(scope, source, undefined, file,
    new Set([selectedParameter.identity]), { depth: 0 }, excluded);
  assert.equal(selected?.get(selectedParameter.identity) === floating && originalQueries === 1, true,
    "the actual independent input selects float64 through its original checked formal");
  const absent = inferSourceCallTargetTypeArguments(scope, source, undefined, file,
    new Set([selectedParameter.identity]), { depth: 0 }, new Set([0, 1]));
  assert.equal(absent?.size, 0, "no independent input is not an inferred rounding authority");
  scope.host.ast.getSourceFile = () => undefined;
  const foreign = inferSourceCallTargetTypeArguments(scope, source, undefined, file,
    new Set([selectedParameter.identity]), { depth: 0 }, excluded);
  assert.equal(foreign?.size === 0 && originalQueries === 1, true,
    "missing original declaration provenance cannot manufacture a formal or use the selected array's type");
  const complete = { nativeParameters: [{ targetParameter: { name: "sample", type: nativeParameter, passingMode: "by-value" } }] };
  const native = inferSourceCallTargetTypeArguments(scope, source, complete, file,
    new Set([nativeParameter.identity]), { depth: 0 }, excluded);
  assert.equal(native?.get(nativeParameter.identity) === floating && originalQueries === 1, true,
    "a completed native ABI keeps its own binder identity and never reselects an authored formal");
});

function fixture(carrier = csharpDelegateTargetType("System.Func", [integer], integer), direct = false) {
  const expression = {};
  const declaration = { kind: direct ? "function" : "variable" };
  const signatureDeclaration = { kind: "arrow" };
  const sourceParameter = {};
  const source = { call: {}, sourceCallee: { expression, type: {}, selectedDeclaration: signatureDeclaration },
    selectedSignature: {}, sourceSelectedSignatureKind: "resolved",
    sourceSelectedSignatureParameters: [{ parameterDeclaration: sourceParameter, parameterName: "value", parameterIndex: 0,
      selectedType: integer, acceptsOmission: false, rest: false }] };
  if (direct) source.sourceCallee.selectedDeclaration = declaration;
  const openContract = { kind: "source", sourceDeclaration: signatureDeclaration,
    nativeSignature: Object.freeze({ methodTypeParameterIdentities: [], methodAllowsRefLikeTypeArguments: [] }), parameters: [sourceParameter],
    nativeParameters: [{ sourceParameter, targetParameter: { name: "value", type: outer, passingMode: "by-value" } }], returnType: outer };
  const scope = { host: {
    ast: { typeParameters: () => [], is: { IsNewExpression: () => false, IsFunctionDeclaration: node => node?.kind === "function",
      IsMethodDeclaration: () => false, IsClassDeclaration: () => false }, parent: () => undefined, kindName: node => node?.kind },
    navigation: { sourceReferenceFor: () => ({ declaration }), isProjectDeclaration: () => false },
    semantics: () => ({ declarations: { signatureDeclaration: () => signatureDeclaration }, operations: {
      callResult: () => undefined, callParameterSlots: selected => selectSourceCallParameterSlots(selected, { isTuple: () => false }),
    } }),
    projectTypes: () => ({ catalog: { definitionForTarget: () => undefined } }),
    projectTypeCatalog: { definitionForTarget: () => undefined },
    typeDefinitions: { sourceUnionArms: () => undefined },
    representations: { genericProjections: () => [], sourceCallable: () => { assert.equal(direct, true, "stored invocation must never select the creation ABI"); return openContract; } },
  }, resolveSelectedValueWithState: () => carrier,
    sourceCallableTypeParametersMatch: () => true,
    resolveSourceCallSelectedType: () => assert.fail("the closed stored contract must not fall back to source templates"),
    resolveSourceCallableContractType: (_source, _callable, type) => type,
    sourceCallSelectedDeclaration: () => signatureDeclaration,
  };
  scope.resolveSourceCallContract = (...arguments_) => resolveSourceCallContract(scope, ...arguments_);
  scope.resolveSourceCallParameter = (...arguments_) => resolveSourceCallParameter(scope, ...arguments_);
  return { scope, source, signatureDeclaration, openContract, sourceParameter };
}

test("stored aliases use their selected closed input and result, not creation templates", () => {
  for (const type of [integer, string]) {
    for (const carrier of [csharpDelegateTargetType("System.Func", [type], type),
      csharpNullableTargetType(csharpDelegateTargetType("System.Func", [type], type))]) {
      const { scope, source, signatureDeclaration, sourceParameter } = fixture(carrier);
      for (const selection of ["checked", "implementation"]) {
        const selected = scope.resolveSourceCallContract(source, {}, { depth: 0 }, selection);
        assert.equal(selected.kind, "value");
        assert.equal(selected.contract.sourceDeclaration === signatureDeclaration, true, "exact signature provenance");
        assert.equal(selected.contract.nativeParameters[0].sourceParameter === sourceParameter, true, "exact argument correspondence");
        assert.equal(targetTypeRefEquals(selected.contract.returnType, type), true, "closed result");
        assert.equal(csharpFreeTypeParameterIdentities([selected.contract.returnType]).size, 0, "no free creation binder");
        assert.equal(Object.isFrozen(selected.contract.nativeParameters[0].targetParameter), true);
      }
      assert.equal(targetTypeRefEquals(resolveSourceCallParameter(scope, source, 0, {}), type), true);
      assert.equal(targetTypeRefEquals(resolveSourceCallParameters(scope, source, {})[0].type, type), true);
      assert.equal(targetTypeRefEquals(resolveSourceCallArgumentParameter(scope, source,
        { sourceParameterIndex: 0, effectiveArgumentIndex: 0, sourceForm: "value" }, {}), type), true);
      const result = resolveSourceCallResultWithState(scope, source, {}, { depth: 0 }, undefined);
      assert.equal(targetTypeRefEquals(result.nativeType, type), true);
      assert.equal(targetTypeRefEquals(result.selectedType, type), true);
    }
  }
});

test("stored quantified protocols retain closed outer bindings and exact invocation binders", () => {
  for (const environment of [integer, string]) {
    const current = fixture();
    const [parameter] = checkedBinders(current);
    const binder = parameter.type;
    const signature = csharpDelegateTargetType("System.Func", [binder], { kind: "tuple", elements: [outer, binder] });
    const value = retainedProtocol(current, signature,
      [{ ...binder, declaration: parameter.declaration, constraints: [] }]);
    assert.equal(value !== undefined, true, "quantified owner");
    const { scope, source } = current;
    scope.resolveSelectedValueWithState = () => substituteTargetTypeParameters(value, new Map([[outer.identity, environment]]));
    source.sourceSelectedMethodTypeArguments = [{ typeParameter: parameter.declaration }];
    const selected = scope.resolveSourceCallContract(source, {}, { depth: 0 }, "checked");
    assert.equal(selected.kind, "value");
    assert.deepEqual(selected.contract.nativeSignature.methodTypeParameterIdentities, [binder.identity]);
    assert.equal(targetTypeRefEquals(selected.contract.nativeParameters[0].targetParameter.type, binder), true);
    assert.equal(targetTypeRefEquals(selected.contract.returnType.elements[0], environment), true);
    assert.deepEqual([...csharpFreeTypeParameterIdentities([selected.contract.returnType])], [binder.identity]);
    scope.resolveSourceCallInstantiation = (_source, _file, _state, identities, contract) => {
      assert.deepEqual(identities, [binder.identity]);
      assert.equal(targetTypeRefEquals(contract.nativeParameters[0].targetParameter.type, binder), true, "native inference pattern");
      assert.equal(targetTypeRefEquals(contract.returnType.elements[0], environment), true, "closed environment at inference");
      return { arguments: [integer], substitutions: new Map([[binder.identity, integer]]) };
    };
    assert.deepEqual(resolveSourceCallTypeArguments(scope, source, {}), [integer]);
  }
});

test("missing or inconsistent stored evidence rejects without a declaration fallback", () => {
  for (const carrier of [undefined, integer, csharpDelegateTargetType("System.Func", [], integer)]) {
    const { scope, source } = fixture();
    scope.resolveSelectedValueWithState = () => carrier;
    assert.equal(scope.resolveSourceCallContract(source, {}, { depth: 0 }, "checked").kind, "rejected");
    assert.equal(resolveSourceCallParameter(scope, source, 0, {}) === undefined, true);
    assert.equal(resolveSourceCallParameters(scope, source, {}) === undefined, true);
    assert.equal(resolveSourceCallResultWithState(scope, source, {}, { depth: 0 }, undefined) === undefined, true);
  }
});

test("direct declarations retain their native ABI and stored optional/rest metadata remains exact", () => {
  const { scope, source, openContract } = fixture(undefined, true);
  const selected = scope.resolveSourceCallContract(source, {}, { depth: 0 }, "checked");
  assert.equal(selected.kind, "declaration");
  assert.equal(selected.contract === openContract, true, "direct declaration authority");
  const optional = csharpNullableTargetType(integer);
  const stored = fixture(csharpDelegateTargetType("System.Action", [optional], undefined,
    { optionalParameterIndexes: [0] }));
  stored.source.sourceSelectedSignatureParameters[0].acceptsOmission = true;
  const contract = resolveSourceCallParameters(stored.scope, stored.source, {});
  assert.equal(contract[0].optional, true);
  assert.equal(contract[0].paramsArray, false);
  assert.equal(targetTypeRefEquals(resolveSourceCallArgumentParameter(stored.scope, stored.source,
    { sourceParameterIndex: 0, effectiveArgumentIndex: 0, sourceForm: "value" }, {}), optional), true);
  const sequence = { kind: "array", element: integer };
  const rest = fixture(csharpDelegateTargetType("System.Action", [sequence], undefined, { restParameterIndex: 0 }));
  rest.source.sourceSelectedSignatureParameters[0].rest = true;
  rest.source.sourceSelectedSignatureParameters[0].acceptsOmission = true;
  const restContract = resolveSourceCallParameters(rest.scope, rest.source, {});
  assert.equal(restContract[0].paramsArray, true);
  assert.equal(restContract[0].optional, false);
  for (const sourceForm of ["value", "spread-element", "spread-sequence"]) {
    assert.equal(targetTypeRefEquals(resolveSourceCallArgumentParameter(rest.scope, rest.source,
      { sourceParameterIndex: 0, effectiveArgumentIndex: 0, sourceForm }, {}), sourceForm === "spread-sequence" ? sequence : integer), true,
      sourceForm);
  }
});

test("checked callable evidence keeps variadic omission separate from optional native slots", () => {
  const sequence = { kind: "array", element: integer };
  const scope = { host: { ast: {}, representations: {
    genericProjections: () => assert.fail("a declaration-free checked callable has no native projection owner"),
  } },
    resolveSignatureParameterEvidence: parameter => parameter.type,
    resolveSourceTypeComponentEvidence: result => result.selectedType,
  };
  const required = { type: integer, parameterKind: "required", acceptsOmission: false };
  const optional = { type: csharpNullableTargetType(integer), parameterKind: "optional", acceptsOmission: true };
  const rest = { type: sequence, parameterKind: "rest", acceptsOmission: true };
  for (const parameters of [[rest], [required, rest], [optional, rest]]) {
    const selected = resolveCallableEvidence(scope, { parameters, result: { selectedType: integer } },
      { sourceFile: {} }, { depth: 0 });
    assert.equal(selected !== undefined, true, "one exact native callable");
    assert.equal(selected.csharpDelegateSignature.restParameterIndex, parameters.length - 1);
    assert.deepEqual(selected.csharpDelegateSignature.optionalParameterIndexes ?? [],
      parameters[0] === optional ? [0] : []);
    assert.equal(selected.csharpDelegateSignature.parameters.at(-1) === sequence, true, "unchanged rest carrier");
  }
  for (const parameters of [[rest, required], [rest, rest]]) {
    assert.equal(resolveCallableEvidence(scope, { parameters, result: { selectedType: integer } },
      { sourceFile: {} }, { depth: 0 }) === undefined, true, "malformed rest ABI rejected");
  }
});

test("direct selected rest declarations also retain the distinct native variadic slot", () => {
  const { scope, source } = fixture(undefined, true);
  const sequence = { kind: "array", element: integer };
  scope.resolveSourceCallContract = () => ({ kind: "declaration" });
  scope.resolveSourceCallSelectedType = () => sequence;
  source.sourceSelectedSignatureParameters[0].rest = true;
  source.sourceSelectedSignatureParameters[0].acceptsOmission = true;
  const parameters = resolveSourceCallParameters(scope, source, {});
  assert.equal(parameters.length, 1);
  assert.equal(parameters[0].type === sequence, true, "exact native sequence carrier");
  assert.equal(parameters[0].paramsArray, true);
  assert.equal(parameters[0].optional, false, "rest omission never becomes a CLR default");
});

function checkedBinders(current, count = 2) {
  const file = {};
  const parameters = Array.from({ length: count }, (_value, index) => ({ kind: "parameter", position: 10 + index * 10 }));
  const ast = current.scope.host.ast;
  Object.assign(ast, { getSourceFile: () => file, getPath: () => "fixture.ts", kind: () => 169,
    pos: node => node.position, end: node => node.position + 1, name: () => ({}), text: () => "Item" });
  ast.is.IsTypeParameterDeclaration = node => node?.kind === "parameter";
  ast.typeParameters = node => node === current.signatureDeclaration ? [parameters[0]] : [];
  current.scope.host.typeParameterConstraints = createCsharpTypeParameterEnvironment(ast,
    () => Object.freeze({ kind: "resolved", constraints: Object.freeze([]) }));
  const original = current.scope.host.semantics();
  current.scope.host.semantics = () => ({ ...original, declarations: { ...original.declarations,
    typeSymbol: type => type, symbolDeclarations: symbol => [symbol] } });
  current.scope.host.representations.genericProjections = () => [];
  current.scope.sourceCallableTypeParametersMatch = (...arguments_) => sourceCallableTypeParametersMatch(current.scope, ...arguments_);
  return parameters.map(declaration => ({ declaration, type: csharpSourceTypeParameter(declaration, ast) }));
}

function retainedProtocol(current, signature, parameters) {
  let protocol;
  const value = retainCsharpGenericCallableValue(signature, parameters, shape => { protocol = shape; return shape; },
    () => ({ kind: "resolved", constraints: [] }));
  current.scope.host.structuralTypes = { resolveTarget: owner => protocol === undefined ? undefined
    : instantiateCsharpObjectShape(protocol, owner) };
  return value;
}

test("stored invocation validates exact checked binder identities and native projections", () => {
  const ordinary = fixture();
  const ordinaryBinders = checkedBinders(ordinary);
  ordinary.source.sourceSelectedMethodTypeArguments = [{ typeParameter: ordinaryBinders[0].declaration }];
  assert.equal(ordinary.scope.resolveSourceCallContract(ordinary.source, {}, { depth: 0 }, "checked").kind, "rejected",
    "ordinary storage cannot discard selected invocation binders");
  const current = fixture();
  const parameters = checkedBinders(current);
  const signature = csharpDelegateTargetType("System.Func", [parameters[0].type], parameters[0].type);
  const value = retainedProtocol(current, signature,
    [{ ...parameters[0].type, declaration: parameters[0].declaration, constraints: [] }]);
  current.scope.resolveSelectedValueWithState = () => value;
  for (const selected of [[], [parameters[1]], [parameters[0], parameters[1]], [parameters[1], parameters[0]]]) {
    current.source.sourceSelectedMethodTypeArguments = selected.map(parameter => ({ typeParameter: parameter.declaration }));
    assert.equal(current.scope.resolveSourceCallContract(current.source, {}, { depth: 0 }, "checked").kind, "rejected",
      "absent, foreign, extra or reordered invocation evidence");
  }
  current.source.sourceSelectedMethodTypeArguments = [{ typeParameter: parameters[0].declaration }];
  assert.equal(current.scope.resolveSourceCallContract(current.source, {}, { depth: 0 }, "checked").kind, "value");
  const projection = csharpProjectedType({ kind: "optional", part: "storage", arguments: [parameters[0].type] });
  current.scope.host.representations.genericProjections = () => [projection];
  assert.equal(current.scope.resolveSourceCallContract(current.source, {}, { depth: 0 }, "checked").kind, "rejected",
    "unexpected native projection cannot be dropped");
  const projected = retainedProtocol(current, signature,
    [{ ...parameters[0].type, declaration: parameters[0].declaration, constraints: [] },
      { ...projection, declaration: current.signatureDeclaration, constraints: projection.csharpProjectionConstraints }]);
  current.scope.resolveSelectedValueWithState = () => projected;
  assert.equal(current.scope.resolveSourceCallContract(current.source, {}, { depth: 0 }, "checked").kind, "value",
    "exact selected method and projected binder family");
  const direct = fixture(undefined, true);
  checkedBinders(direct);
  direct.source.sourceSelectedMethodTypeArguments = ordinary.source.sourceSelectedMethodTypeArguments;
  assert.equal(sourceCallableTypeParametersMatch(direct.scope, direct.source, direct.openContract, "declaration"), true,
    "nongeneric implementation of a checked generic overload retains its declaration ABI");
});

test("stored value calls alpha-bind complete checked quantifiers without changing native owners", () => {
  const current = fixture();
  const [native, unusedNative, checked, unusedChecked] = checkedBinders(current, 4);
  current.scope.host.ast.typeParameters = node => node === current.signatureDeclaration
    ? [checked.declaration, unusedChecked.declaration] : [];
  current.source.sourceSelectedMethodTypeArguments = [checked, unusedChecked].map(parameter => ({ typeParameter: parameter.declaration }));
  const signature = csharpDelegateTargetType("System.Func", [native.type], { kind: "tuple", elements: [outer, native.type] });
  const value = retainedProtocol(current, signature, [native, unusedNative].map(parameter =>
    ({ ...parameter.type, declaration: parameter.declaration, constraints: [] })));
  const closed = substituteTargetTypeParameters(value, new Map([[outer.identity, integer]]));
  current.scope.resolveSelectedValueWithState = () => closed;
  const selected = current.scope.resolveSourceCallContract(current.source, {}, { depth: 0 }, "checked");
  assert.equal(selected.kind, "value", "separately authored return and captured body binders are alpha-corresponding");
  assert.deepEqual(selected.contract.nativeSignature.methodTypeParameterIdentities, [checked.type.identity, unusedChecked.type.identity],
    "the unused native quantifier is retained in its real invocation slot");
  assert.deepEqual(selected.contract.nativeSignature.methodAllowsRefLikeTypeArguments, [false, false], "native anti-constraints are unchanged");
  assert.equal(targetTypeRefEquals(selected.contract.nativeParameters[0].targetParameter.type, checked.type), true,
    "only the checked invocation parameter is alpha-normalized");
  assert.equal(targetTypeRefEquals(selected.contract.returnType.elements[0], integer), true, "captured native owner arguments stay closed");
  assert.equal(targetTypeRefEquals(selected.contract.returnType.elements[1], checked.type), true, "the exact checked result binder is retained");
  assert.equal(closed.csharpMethodValue.owner.typeArguments[0] === integer, true, "the selected physical owner is not replaced");
  assert.deepEqual(closed.csharpMethodValue.typeParameters, [native.type.identity, unusedNative.type.identity],
    "transient checked binding never mutates the selected native value");
  const shared = csharpMethodValueType(closed.csharpMethodValue.owner, closed.csharpMethodValue.method,
    closed.csharpMethodValue.identity, csharpDelegateTargetType("System.Func", [checked.type],
      { kind: "tuple", elements: [integer, checked.type] }), [checked.type.identity, unusedChecked.type.identity]);
  current.scope.resolveSelectedValueWithState = () => shared;
  assert.equal(current.scope.resolveSourceCallContract(current.source, {}, { depth: 0 }, "checked").kind, "value",
    "the first interned alpha-equivalent protocol's declaration IDs do not replace this selected invocation's binders");
  const contradictory = csharpMethodValueType(closed.csharpMethodValue.owner, closed.csharpMethodValue.method,
    closed.csharpMethodValue.identity, csharpDelegateTargetType("System.Func", [native.type],
      { kind: "tuple", elements: [string, native.type] }), [native.type.identity, unusedNative.type.identity]);
  current.scope.resolveSelectedValueWithState = () => contradictory;
  assert.equal(current.scope.resolveSourceCallContract(current.source, {}, { depth: 0 }, "checked").kind, "rejected",
    "alpha-normalizing invocation binders never changes the captured native owner payload");
  current.scope.resolveSelectedValueWithState = () => closed;
  const original = current.scope.host.structuralTypes.resolveTarget;
  current.scope.host.structuralTypes.resolveTarget = () => undefined;
  assert.equal(current.scope.resolveSourceCallContract(current.source, {}, { depth: 0 }, "checked").kind, "rejected",
    "a missing native invocation cannot be repaired by binder arity or spelling");
  current.scope.host.structuralTypes.resolveTarget = owner => {
    const protocol = original(owner);
    return { ...protocol, members: [...protocol.members, ...protocol.members] };
  };
  assert.equal(current.scope.resolveSourceCallContract(current.source, {}, { depth: 0 }, "checked").kind, "rejected",
    "ambiguous native invocation evidence is refused independently");
  current.scope.host.structuralTypes.resolveTarget = original;
  current.source.sourceSelectedMethodTypeArguments = [native, unusedNative].map(parameter => ({ typeParameter: parameter.declaration }));
  assert.equal(current.scope.resolveSourceCallContract(current.source, {}, { depth: 0 }, "checked").kind, "rejected",
    "matching native IDs cannot stand in for the actual checked declaration's foreign binders");
});

test("stored value alpha-binding preserves nested projection geometry and native slot order", () => {
  const current = fixture();
  const [native, unusedNative, checked, unusedChecked] = checkedBinders(current, 4);
  current.scope.host.ast.typeParameters = node => node === current.signatureDeclaration
    ? [checked.declaration, unusedChecked.declaration] : [];
  const nativeDeclaration = {};
  const nativeStorage = csharpProjectedType({ kind: "optional", part: "storage", arguments: [native.type] });
  const nativeOperations = csharpProjectedType({ kind: "optional", part: "operations", arguments: [native.type] });
  const nativeNested = csharpProjectedType({ kind: "optional", part: "storage", arguments: [nativeStorage] });
  const checkedStorage = csharpProjectedType({ kind: "optional", part: "storage", arguments: [checked.type] });
  const checkedOperations = csharpProjectedType({ kind: "optional", part: "operations", arguments: [checked.type] });
  const checkedNested = csharpProjectedType({ kind: "optional", part: "storage", arguments: [checkedStorage] });
  current.scope.host.representations.genericProjections = declaration => declaration === nativeDeclaration
    ? [nativeOperations, nativeNested, nativeStorage] : declaration === current.signatureDeclaration
      ? [checkedStorage, checkedNested, checkedOperations] : [];
  current.source.sourceSelectedMethodTypeArguments = [checked, unusedChecked].map(parameter => ({ typeParameter: parameter.declaration }));
  const signature = csharpDelegateTargetType("System.Func", [native.type], native.type);
  const parameters = [native, unusedNative].map(parameter => ({ ...parameter.type, declaration: parameter.declaration, constraints: [] }));
  parameters.push(...[nativeOperations, nativeNested, nativeStorage].map(parameter =>
    ({ ...parameter, declaration: nativeDeclaration, constraints: parameter.csharpProjectionConstraints })));
  const value = retainedProtocol(current, signature, parameters);
  current.scope.resolveSelectedValueWithState = () => value;
  const selected = current.scope.resolveSourceCallContract(current.source, {}, { depth: 0 }, "checked");
  assert.equal(selected.kind, "value", "complete nested native projections are related by semantic geometry");
  assert.deepEqual(selected.contract.nativeSignature.methodTypeParameterIdentities,
    [checked.type.identity, unusedChecked.type.identity, checkedOperations.identity, checkedNested.identity, checkedStorage.identity],
    "checked discovery order cannot replace the original native entry's projection slot order");
  const original = current.scope.host.representations.genericProjections;
  current.scope.host.representations.genericProjections = declaration => declaration === current.signatureDeclaration
    ? [checkedStorage, checkedStorage, checkedOperations] : original(declaration);
  assert.equal(current.scope.resolveSourceCallContract(current.source, {}, { depth: 0 }, "checked").kind, "rejected",
    "a duplicate projection cannot replace the complete nested tail");
});

test("native value invocation keeps unused constraint proof and rejects corrupted anti-constraints", () => {
  for (const constrained of [false, true]) {
    const current = fixture();
    const [native, unusedNative, checked, unusedChecked] = checkedBinders(current, 4);
    current.scope.host.ast.typeParameters = node => node === current.signatureDeclaration
      ? [checked.declaration, unusedChecked.declaration] : [];
    current.source.sourceSelectedMethodTypeArguments = [checked, unusedChecked].map(parameter => ({ typeParameter: parameter.declaration }));
    const value = retainedProtocol(current, csharpDelegateTargetType("System.Func", [native.type], native.type),
      [{ ...native.type, declaration: native.declaration, constraints: [] },
        { ...unusedNative.type, declaration: unusedNative.declaration,
          constraints: constrained ? [{ kind: "keyword", keyword: "class" }] : [] }]);
    current.scope.resolveSelectedValueWithState = () => value;
    assert.equal(current.scope.resolveSourceCallContract(current.source, {}, { depth: 0 }, "checked").kind,
      constrained ? "rejected" : "value", "unused native constraints cannot be dropped by signature-only matching");
    current.scope.resolveSelectedValueWithState = () => ({ ...value,
      csharpMethodValue: { ...value.csharpMethodValue, allowsRefLikeTypeArguments: [] } });
    assert.equal(current.scope.resolveSourceCallContract(current.source, {}, { depth: 0 }, "checked").kind, "rejected",
      "an incomplete native anti-constraint vector is not a valid identity case");
  }
});

test("selected stored contracts do not require invented signature or parameter syntax", () => {
  const { scope, source } = fixture();
  source.sourceSelectedSignatureParameters[0].parameterDeclaration = undefined;
  const original = scope.host.semantics();
  scope.host.semantics = () => ({ ...original, declarations: { signatureDeclaration: () => undefined } });
  const selected = scope.resolveSourceCallContract(source, {}, { depth: 0 }, "checked");
  assert.equal(selected.kind, "value", "exact native and selected semantic parameter correspondence");
  assert.equal(selected.contract.sourceDeclaration === undefined, true);
  assert.equal(selected.contract.nativeParameters[0].sourceParameter === undefined, true);
  assert.equal(targetTypeRefEquals(resolveSourceCallParameter(scope, source, 0, {}), integer), true);
});

test("native invocation arguments retain their complete projected order independently of checked inventory order", () => {
  const current = fixture(undefined, true);
  const [parameter] = checkedBinders(current);
  const storage = csharpProjectedType({ kind: "optional", part: "storage", arguments: [parameter.type] });
  const operations = csharpProjectedType({ kind: "optional", part: "operations", arguments: [parameter.type] });
  current.scope.host.ast.typeParameters = () => [parameter.declaration];
  current.scope.host.semanticsFor = () => current.scope.host.semantics();
  current.scope.host.representations.genericProjections = () => [storage, operations];
  current.scope.resolveAuthoredAndSelectedSourceType = () => integer;
  current.source.sourceSelectedMethodTypeArguments = [{ typeParameter: parameter.declaration, typeParameterName: "Item",
    selectedType: {}, explicitTypeNode: {} }];
  current.openContract.nativeSignature = Object.freeze({ methodTypeParameterIdentities: [
    parameter.type.identity, operations.identity, storage.identity], methodAllowsRefLikeTypeArguments: [false, false, false] });
  assert.equal(sourceCallableTypeParametersMatch(current.scope, current.source, current.openContract, "declaration"), true,
    "the complete exact projection family is independent of discovery order");
  const selected = resolveSourceCallInstantiation(current.scope, current.source, {}, { depth: 0 },
    current.openContract.nativeSignature.methodTypeParameterIdentities, current.openContract);
  assert.equal(selected !== undefined, true, "the complete native invocation is admitted");
  assert.equal(selected.arguments.length, 3, "neither native projection is dropped");
  assert.equal(selected.arguments[0] === integer, true, "the original authored invocation retains its argument identity");
  assert.equal(selected.arguments[1] === selected.substitutions.get(operations.identity), true,
    "the actual native operations slot precedes storage in this invocation");
  assert.equal(selected.arguments[2] === selected.substitutions.get(storage.identity), true,
    "the actual native storage slot is not replaced by discovery order");
  current.scope.host.representations.genericProjections = () => [storage, storage];
  assert.equal(sourceCallableTypeParametersMatch(current.scope, current.source, current.openContract, "declaration"), false,
    "a duplicate cannot stand in for a missing native projection");
  assert.equal(resolveSourceCallInstantiation(current.scope, current.source, {}, { depth: 0 },
    current.openContract.nativeSignature.methodTypeParameterIdentities, current.openContract) === undefined, true,
  "instantiation independently rejects the incomplete projection family");
});

test("checked narrow overload arguments use the selected native implementation carrier", () => {
  const current = fixture(undefined, true);
  const native = { kind: "tuple", elements: [integer, string] };
  current.openContract.nativeParameters[0].targetParameter.type = native;
  const argument = { sourceParameterIndex: 0, effectiveArgumentIndex: 0, sourceForm: "value" };
  assert.equal(targetTypeRefEquals(resolveSourceCallArgumentParameter(current.scope, current.source, argument, {}), native), true,
    "the selected implementation owns physical argument storage");
  assert.equal(resolveSourceCallArgumentParameter(current.scope, current.source, { ...argument, effectiveArgumentIndex: 3 }, {}) === undefined, true,
    "missing implementation slots cannot fall back to a checked narrow carrier");
});

test("native overload binders remap only through exact checked implementation correspondence", () => {
  const current = fixture(undefined, true);
  const binders = checkedBinders(current);
  const checked = current.signatureDeclaration;
  const implementation = { kind: "function" };
  current.openContract.sourceDeclaration = implementation;
  current.openContract.nativeSignature = Object.freeze({ ...current.openContract.nativeSignature,
    methodTypeParameterIdentities: [binders[1].type.identity] });
  current.source.sourceSelectedMethodTypeArguments = [{ typeParameter: binders[0].declaration }];
  current.scope.host.ast.typeParameters = node => node === checked ? [binders[0].declaration] : [binders[1].declaration];
  current.scope.host.navigation.callableImplementation = () => ({ kind: "resolved", implementation: { declaration: implementation } });
  assert.equal(sourceCallableTypeParametersMatch(current.scope, current.source, current.openContract, "declaration"), true,
    "different authored binder names preserve the exact native implementation slot");
  current.source.sourceSelectedMethodTypeArguments = [{ typeParameter: binders[1].declaration }];
  assert.equal(sourceCallableTypeParametersMatch(current.scope, current.source, current.openContract, "declaration"), false,
    "a foreign binder is not accepted merely because its target identity matches");
  current.source.sourceSelectedMethodTypeArguments = [{ typeParameter: binders[0].declaration }];
  current.scope.host.navigation.callableImplementation = () => ({ kind: "resolved", implementation: { declaration: {} } });
  assert.equal(sourceCallableTypeParametersMatch(current.scope, current.source, current.openContract, "declaration"), false,
    "unrelated native declarations cannot own the checked overload");
  current.scope.host.navigation.callableImplementation = () => ({ kind: "resolved", implementation: { declaration: implementation } });
  current.scope.host.ast.typeParameters = node => node === checked ? [binders[0].declaration] : [binders[1].declaration, {}];
  assert.equal(sourceCallableTypeParametersMatch(current.scope, current.source, current.openContract, "declaration"), false,
    "implementation arity cannot be repaired through binder spelling or a partial prefix");
});

test("bulk parameter resolution selects the complete stored contract once", () => {
  const { scope, source } = fixture(csharpDelegateTargetType("System.Func", Array(12).fill(integer), integer));
  source.sourceSelectedSignatureParameters = Array.from({ length: 12 }, (_value, index) =>
    ({ parameterDeclaration: {}, parameterName: `value${index}`, parameterIndex: index,
      selectedType: integer, acceptsOmission: false, rest: false }));
  const select = scope.resolveSourceCallContract;
  let selections = 0;
  scope.resolveSourceCallContract = (...arguments_) => { selections += 1; return select(...arguments_); };
  const parameters = resolveSourceCallParameters(scope, source, {});
  assert.equal(parameters.length, 12);
  assert.equal(parameters.every(parameter => targetTypeRefEquals(parameter.type, integer)), true);
  assert.equal(selections, 1, "no quadratic complete contract reconstruction");
});

test("wide optional signatures collect optional indexes once rather than scanning them per parameter", () => {
  const count = 128;
  const optional = csharpNullableTargetType(integer);
  const indexes = Array.from({ length: count }, (_value, index) => index);
  indexes.includes = () => assert.fail("wide invocation cannot repeatedly scan its optional-index array");
  const carrier = csharpDelegateTargetType("System.Action", Array(count).fill(optional), undefined,
    { optionalParameterIndexes: indexes });
  const { scope, source } = fixture({ ...carrier, csharpDelegateSignature: {
    ...carrier.csharpDelegateSignature, optionalParameterIndexes: indexes,
  } });
  source.sourceSelectedSignatureParameters = Array.from({ length: count }, (_value, index) =>
    ({ parameterDeclaration: {}, parameterName: `value${index}`, parameterIndex: index,
      selectedType: integer, acceptsOmission: true, rest: false }));
  const parameters = resolveSourceCallParameters(scope, source, {});
  assert.equal(parameters.length, count);
  assert.equal(parameters.every(parameter => parameter.optional && targetTypeRefEquals(parameter.type, optional)), true);
});

test("super construction obtains its exact selected native base environment", () => {
  const expression = {};
  const constructor = {};
  const owner = {};
  const base = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: "fixture.Base", typeArguments: [integer] };
  const source = { sourceCallee: { expression } };
  const selected = resolveSourceCallReceiverTargetType({ host: {
    ast: { kindName: () => "KindSuperKeyword", parent: node => node === expression ? constructor : node === constructor ? owner : undefined,
      hasModifierKind: () => false,
      is: { IsArrowFunction: () => false, IsFunctionDeclaration: () => false, IsFunctionExpression: () => false,
        IsMethodDeclaration: () => false, IsGetAccessorDeclaration: () => false, IsSetAccessorDeclaration: () => false,
        IsConstructorDeclaration: node => node === constructor, IsPropertyDeclaration: () => false,
        IsClassDeclaration: node => node === owner, IsClassExpression: () => false } },
    projectTypeCatalog: { definitionForDeclaration: declaration => {
      assert.equal(declaration === owner, true, "the actual construction class owns its native environment");
      return { declaration: owner, typeParameterBindings: [] };
    }, targetTypeForDeclaration: declaration => {
      assert.equal(declaration === owner, true, "heritage instantiation consumes the exact enclosing class identity");
      return base;
    } },
  }, resolveNodeWithState: () => assert.fail("super is construction syntax, never a runtime value lookup"),
  }, source, {}, { depth: 0 });
  assert.equal(selected === base, true, "heritage instantiation stays at the existing receiver owner");
});
