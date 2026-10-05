import assert from "node:assert/strict";
import test from "node:test";
import { resolveSourceCallContract } from "../../../dist/policy/types/resolution/call-contracts.js";
import { resolveSourceCallParameter, resolveSourceCallParameters, resolveSourceCallArgumentParameter,
  resolveSourceCallResultWithState, resolveSourceCallTypeArguments } from "../../../dist/policy/types/resolution/public-api.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/delegates.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/nullable.js";
import { retainCsharpGenericCallableValue } from "../../../dist/policy/types/callables/generic-values.js";
import { substituteTargetTypeParameters } from "../../../dist/target-model/types/substitution.js";
import { csharpFreeTypeParameterIdentities } from "../../../dist/target-model/types/generic-references.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { sourceCallableTypeParametersMatch, resolveSourceCallReceiverTargetType } from "../../../dist/policy/types/resolution/calls.js";
import { csharpSourceTypeParameter } from "../../../dist/target-model/names/type-parameters.js";

const integer = { kind: "source-primitive", name: "int64" };
const string = { kind: "source-primitive", name: "string" };
const binder = { kind: "type-parameter", identity: "inner:Item", name: "Item" };
const outer = { kind: "type-parameter", identity: "outer:Item", name: "Item" };

function fixture(carrier = csharpDelegateTargetType("System.Func", [integer], integer), direct = false) {
  const expression = {};
  const declaration = { kind: direct ? "function" : "variable" };
  const signatureDeclaration = { kind: "arrow" };
  const sourceParameter = {};
  const source = { call: {}, sourceCallee: { expression, type: {}, selectedDeclaration: signatureDeclaration },
    selectedSignature: {}, sourceSelectedSignatureParameters: [{ parameterDeclaration: sourceParameter, parameterName: "value" }] };
  if (direct) source.sourceCallee.selectedDeclaration = declaration;
  const openContract = { sourceDeclaration: signatureDeclaration, methodTypeParameterIdentities: [],
    parameters: [{ sourceParameter, targetParameter: { name: "value", type: outer, passingMode: "by-value" } }], returnType: outer };
  const scope = { host: {
    ast: { is: { IsNewExpression: () => false, IsFunctionDeclaration: node => node?.kind === "function",
      IsMethodDeclaration: () => false, IsClassDeclaration: () => false }, parent: () => undefined, kindName: node => node?.kind },
    navigation: { sourceReferenceFor: () => ({ declaration }) },
    semantics: () => ({ declarations: { signatureDeclaration: () => signatureDeclaration }, operations: { callResult: () => undefined } }),
    projectTypeCatalog: { definitionForTarget: () => undefined },
    representations: { sourceCallable: () => { assert.equal(direct, true, "stored invocation must never select the creation ABI"); return openContract; } },
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
        assert.equal(selected.contract.parameters[0].sourceParameter === sourceParameter, true, "exact argument correspondence");
        assert.equal(targetTypeRefEquals(selected.contract.returnType, type), true, "closed result");
        assert.equal(csharpFreeTypeParameterIdentities([selected.contract.returnType]).size, 0, "no free creation binder");
        assert.equal(Object.isFrozen(selected.contract.parameters[0].targetParameter), true);
      }
      assert.equal(targetTypeRefEquals(resolveSourceCallParameter(scope, source, 0, {}), type), true);
      assert.equal(targetTypeRefEquals(resolveSourceCallParameters(scope, source, {})[0].type, type), true);
      assert.equal(targetTypeRefEquals(resolveSourceCallArgumentParameter(scope, source,
        { sourceParameterIndex: 0, sourceForm: "value" }, {}), type), true);
      const result = resolveSourceCallResultWithState(scope, source, {}, { depth: 0 }, undefined);
      assert.equal(targetTypeRefEquals(result.nativeType, type), true);
      assert.equal(targetTypeRefEquals(result.selectedType, type), true);
    }
  }
});

test("stored quantified protocols retain closed outer bindings and exact invocation binders", () => {
  for (const environment of [integer, string]) {
    const signature = csharpDelegateTargetType("System.Func", [binder], { kind: "tuple", elements: [outer, binder] });
    const value = retainCsharpGenericCallableValue(signature,
      [{ ...binder, declaration: {}, constraints: [] }], shape => shape, () => ({ kind: "resolved", constraints: [] }));
    assert.equal(value !== undefined, true, "quantified owner");
    const { scope, source } = fixture(substituteTargetTypeParameters(value, new Map([[outer.identity, environment]])));
    const selected = scope.resolveSourceCallContract(source, {}, { depth: 0 }, "checked");
    assert.equal(selected.kind, "value");
    assert.deepEqual(selected.contract.methodTypeParameterIdentities, [binder.identity]);
    assert.equal(targetTypeRefEquals(selected.contract.parameters[0].targetParameter.type, binder), true);
    assert.equal(targetTypeRefEquals(selected.contract.returnType.elements[0], environment), true);
    assert.deepEqual([...csharpFreeTypeParameterIdentities([selected.contract.returnType])], [binder.identity]);
    scope.resolveSourceCallInstantiation = (_source, _file, _state, identities, contract) => {
      assert.deepEqual(identities, [binder.identity]);
      assert.equal(targetTypeRefEquals(contract.parameters[0].targetParameter.type, binder), true, "native inference pattern");
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
    { sourceParameterIndex: 0, sourceForm: "value" }, {}), optional), true);
  const sequence = { kind: "array", element: integer };
  const rest = fixture(csharpDelegateTargetType("System.Action", [sequence], undefined, { restParameterIndex: 0 }));
  rest.source.sourceSelectedSignatureParameters[0].rest = true;
  const restContract = resolveSourceCallParameters(rest.scope, rest.source, {});
  assert.equal(restContract[0].paramsArray, true);
  assert.equal(restContract[0].optional, false);
  for (const sourceForm of ["value", "spread-element", "spread-sequence"]) {
    assert.equal(targetTypeRefEquals(resolveSourceCallArgumentParameter(rest.scope, rest.source,
      { sourceParameterIndex: 0, sourceForm }, {}), sourceForm === "spread-sequence" ? sequence : integer), true,
      sourceForm);
  }
});

function checkedBinders(current) {
  const file = {};
  const parameters = [{ kind: "parameter", position: 10 }, { kind: "parameter", position: 20 }];
  const ast = current.scope.host.ast;
  Object.assign(ast, { getSourceFile: () => file, getPath: () => "fixture.ts", kind: () => 169,
    pos: node => node.position, end: node => node.position + 1, name: () => ({}), text: () => "Item" });
  ast.is.IsTypeParameterDeclaration = node => node?.kind === "parameter";
  const original = current.scope.host.semantics();
  current.scope.host.semantics = () => ({ ...original, declarations: { ...original.declarations,
    typeSymbol: type => type, symbolDeclarations: symbol => [symbol] } });
  current.scope.host.representations.genericProjections = () => [];
  current.scope.sourceCallableTypeParametersMatch = (...arguments_) => sourceCallableTypeParametersMatch(current.scope, ...arguments_);
  return parameters.map(declaration => ({ declaration, type: csharpSourceTypeParameter(declaration, ast) }));
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
  const value = retainCsharpGenericCallableValue(signature,
    [{ ...parameters[0].type, declaration: parameters[0].declaration, constraints: [] }], shape => shape,
    () => ({ kind: "resolved", constraints: [] }));
  current.scope.resolveSelectedValueWithState = () => value;
  for (const selected of [[], [parameters[1]], [parameters[0], parameters[1]], [parameters[1], parameters[0]]]) {
    current.source.sourceSelectedMethodTypeArguments = selected.map(parameter => ({ typeParameter: parameter.declaration }));
    assert.equal(current.scope.resolveSourceCallContract(current.source, {}, { depth: 0 }, "checked").kind, "rejected",
      "absent, foreign, extra or reordered invocation evidence");
  }
  current.source.sourceSelectedMethodTypeArguments = [{ typeParameter: parameters[0].declaration }];
  assert.equal(current.scope.resolveSourceCallContract(current.source, {}, { depth: 0 }, "checked").kind, "value");
  current.scope.host.representations.genericProjections = () => [{ identity: parameters[1].type.identity }];
  assert.equal(current.scope.resolveSourceCallContract(current.source, {}, { depth: 0 }, "checked").kind, "rejected",
    "unexpected native projection cannot be dropped");
  const projected = retainCsharpGenericCallableValue(signature,
    parameters.map(parameter => ({ ...parameter.type, declaration: parameter.declaration, constraints: [] })), shape => shape,
    () => ({ kind: "resolved", constraints: [] }));
  current.scope.resolveSelectedValueWithState = () => projected;
  assert.equal(current.scope.resolveSourceCallContract(current.source, {}, { depth: 0 }, "checked").kind, "value",
    "exact selected method and projected binder family");
  const direct = fixture(undefined, true);
  checkedBinders(direct);
  direct.source.sourceSelectedMethodTypeArguments = ordinary.source.sourceSelectedMethodTypeArguments;
  assert.equal(sourceCallableTypeParametersMatch(direct.scope, direct.source, direct.openContract, "declaration"), true,
    "nongeneric implementation of a checked generic overload retains its declaration ABI");
});

test("selected stored contracts do not require invented signature or parameter syntax", () => {
  const { scope, source } = fixture();
  source.sourceSelectedSignatureParameters[0].parameterDeclaration = undefined;
  scope.host.semantics = () => ({ declarations: { signatureDeclaration: () => undefined },
    operations: { callResult: () => undefined } });
  const selected = scope.resolveSourceCallContract(source, {}, { depth: 0 }, "checked");
  assert.equal(selected.kind, "value", "exact native and selected semantic parameter correspondence");
  assert.equal(selected.contract.sourceDeclaration === undefined, true);
  assert.equal(selected.contract.parameters[0].sourceParameter === undefined, true);
  assert.equal(targetTypeRefEquals(resolveSourceCallParameter(scope, source, 0, {}), integer), true);
});

test("bulk parameter resolution selects the complete stored contract once", () => {
  const { scope, source } = fixture(csharpDelegateTargetType("System.Func", Array(12).fill(integer), integer));
  source.sourceSelectedSignatureParameters = Array.from({ length: 12 }, (_value, index) =>
    ({ parameterDeclaration: {}, parameterName: `value${index}` }));
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
    ({ parameterDeclaration: {}, parameterName: `value${index}`, acceptsOmission: true }));
  const parameters = resolveSourceCallParameters(scope, source, {});
  assert.equal(parameters.length, count);
  assert.equal(parameters.every(parameter => parameter.optional && targetTypeRefEquals(parameter.type, optional)), true);
});

test("super construction obtains its exact selected native base environment", () => {
  const expression = {};
  const base = { kind: "target-named", id: "fixture.Base", typeArguments: [integer] };
  const source = { sourceCallee: { expression } };
  const selected = resolveSourceCallReceiverTargetType({ host: { ast: { kindName: () => "KindSuperKeyword" } },
    resolveNodeWithState: node => { assert.equal(node === expression, true); return base; },
  }, source, {}, { depth: 0 });
  assert.equal(selected === base, true, "heritage instantiation stays at the existing receiver owner");
});
