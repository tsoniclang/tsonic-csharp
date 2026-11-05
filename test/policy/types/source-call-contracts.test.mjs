import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, createSourceSemanticsExtension, sourcePrimitive, formatDiagnostics } from "@tsonic/tsts";
import { analyzeSourceLiteralValues, createTargetSourceProgram } from "@tsonic/target-api/source";
import { resolveSourceCallContract } from "../../../dist/analysis/source-evidence/types/resolution/call-contracts.js";
import { resolveSourceCallParameter, resolveSourceCallParameters, resolveSourceCallArgumentParameter, resolveSourceCallResultWithState, resolveSourceCallTypeArguments } from "../../../dist/analysis/source-evidence/types/resolution/call-api.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { retainCsharpGenericCallableValue } from "../../../dist/analysis/callables/generics/generic-values.js";
import { substituteTargetTypeParameters } from "../../../dist/policy/types/resolution/substitution.js";
import { csharpFreeTypeParameterIdentities } from "../../../dist/target-model/types/generic-references.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { sourceCallableTypeParametersMatch, resolveSourceCallReceiverTargetType, resolveSourceCallInstantiation, inferSourceCallTargetTypeArguments } from "../../../dist/analysis/source-evidence/types/resolution/calls.js";
import { csharpProjectedType } from "../../../dist/target-model/types/projections.js";
import { csharpSourceTypeParameter } from "../../../dist/source/extension/type-parameters.js";
import { selectSourceCallParameterSlots } from "../../../../tsonic/packages/target-api/dist/source-semantics/call-parameter-slots.js";
import { resolveCallableEvidence } from "../../../dist/analysis/source-evidence/types/resolution/source-profiles.js";
import { createCsharpTypeParameterEnvironment, createCsharpSourceTypeParameterEnvironment } from "../../../dist/analysis/source-evidence/types/resolution/type-parameter-environment.js";
import { instantiateCsharpObjectShape } from "../../../dist/policy/types/objects/instantiation.js";
import { csharpMethodValueType } from "../../../dist/target-model/types/method-values.js";

const integer = { kind: "source-primitive", name: "int64" };
const string = { kind: "source-primitive", name: "string" };
const outer = { kind: "type-parameter", identity: "outer:Item", name: "Item" };

test("independent checked arguments infer native destinations before the body ABI without self-authorizing an array", () => {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: { "/src/index.ts": `
    declare class NativeCatalog<Native> {}
    declare function invoke<Item>(sample: Item, values: Item[]): Item;
    declare const sample: number;
    declare const values: number[];
    invoke(sample, values);`,
  }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0);
  const program = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  const call = program.ast.as.AsExpressionStatement(program.ast.statements(file).at(-1)).Expression;
  const queries = program.semantics.forFile(file);
  const source = queries.operations.call(call);
  const signature = queries.declarations.signatureDeclaration(source.selectedSignature);
  const catalog = program.ast.statements(file).find(node => program.ast.is.IsClassDeclaration(node));
  const selectedParameter = csharpSourceTypeParameter(program.ast.typeParameters(signature)[0], program.ast);
  const nativeParameter = csharpSourceTypeParameter(program.ast.typeParameters(catalog)[0], program.ast);
  assert.equal(source.call === call && selectedParameter !== undefined && nativeParameter !== undefined, true,
    "the independent Native boundary retains its actual checked call and both real declaration binders");
  const floating = { kind: "source-primitive", name: "float64" };
  const sampleType = source.sourceSelectedSignatureParameters[0].authoredTypeNode;
  const sample = source.sourceArguments[0].expression;
  let originalQueries = 0;
  const scope = { host: { ast: { ...program.ast }, effectiveTypes: program.effectiveTypes,
    literalValues: analyzeSourceLiteralValues(program.ast, program.sourceFiles),
    semantics: selected => {
      assert.equal(selected === file, true, "the inference query uses the original checked Source file");
      return { ...queries, types: { ...queries.types, expressionType: node => {
      assert.equal(node === sample, true, "the same array cannot participate in its independent destination proof");
      return queries.types.expressionType(node);
    } } }; } },
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

function fixture(carrier = csharpDelegateTargetType("System.Func", [integer], integer), direct = false, options = {}) {
  const genericCount = options.genericCount ?? 0;
  const binders = Array.from({ length: genericCount }, (_value, index) => `Checked${index}`);
  const quantifiers = binders.length === 0 ? "" : `<${binders.join(", ")}>`;
  const parameterCount = options.parameterCount ?? 1;
  const parameter = options.rest ? "...value: unknown[]" : Array.from({ length: parameterCount }, (_value, index) =>
    `value${index}${options.optional ? "?" : ""}: ${binders[0] ?? "unknown"}`).join(", ");
  const result = binders[0] ?? "unknown";
  const callable = direct ? `declare function invoke${quantifiers}(${parameter}): ${result};`
    : `declare const invoke: ${quantifiers}(${parameter}) => ${result};`;
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: { "/src/index.ts":
    `declare class NativeCatalog<Native0, Native1> {} declare function authored(value?: unknown): unknown; ${callable} invoke(${Array(parameterCount).fill("undefined").join(", ")});`,
  }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0);
  const program = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  const call = program.ast.as.AsExpressionStatement(program.ast.statements(file).at(-1)).Expression;
  const queries = program.semantics.forFile(file);
  const selected = queries.operations.call(call);
  const source = selected;
  const declaration = program.navigation.sourceReferenceFor(source.sourceCallee.expression).declaration;
  const signatureDeclaration = queries.declarations.signatureDeclaration(source.selectedSignature);
  const sourceParameter = source.sourceSelectedSignatureParameters[0].parameterDeclaration;
  assert.equal(source.call === call && sourceParameter !== undefined && signatureDeclaration !== undefined, true,
    "the stored-call fixture retains the actual checked call, parameter and signature publication");
  const openContract = { kind: "source", sourceDeclaration: signatureDeclaration,
    nativeSignature: Object.freeze({ methodTypeParameterIdentities: [], methodAllowsRefLikeTypeArguments: [] }), parameters: source.sourceSelectedSignatureParameters.map(parameter => parameter.parameterDeclaration),
    nativeParameters: source.sourceSelectedSignatureParameters.map(parameter => ({ sourceParameter: parameter.parameterDeclaration,
      targetParameter: { name: parameter.parameterName, type: outer, passingMode: "by-value" } })), returnType: outer };
  const scope = { host: {
    effectiveTypes: program.effectiveTypes,
    moduleCallables: Object.freeze({ get: () => undefined }),
    ast: program.ast,
    navigation: program.navigation,
    semantics: selected => {
      assert.equal(selected === file, true, "the Native reader retains the original checked file");
      return queries;
    },
    semanticsFor: node => program.semantics.forNode(node),
    projectTypes: () => ({ catalog: { definitionForTarget: () => undefined } }),
    projectTypeCatalog: { definitionForTarget: () => undefined },
    typeDefinitions: { sourceUnionArms: () => undefined },
    representations: { genericProjections: () => [], closedInputContract: () => undefined,
      sourceCallable: () => { assert.equal(direct, true, "stored invocation must never select the creation ABI"); return openContract; } },
  }, resolveSelectedValueWithState: () => carrier,
    sourceCallableTypeParametersMatch: () => true,
    resolveSourceCallSelectedType: () => assert.fail("the closed stored contract must not fall back to source templates"),
    resolveSourceCallableContractType: (_source, _callable, type) => type,
    sourceCallSelectedDeclaration: () => signatureDeclaration,
  };
  scope.resolveSourceCallContract = (...arguments_) => resolveSourceCallContract(scope, ...arguments_);
  scope.resolveSourceCallParameter = (...arguments_) => resolveSourceCallParameter(scope, ...arguments_);
  const authoredDeclaration = program.ast.statements(file).find(node => program.ast.is.IsFunctionDeclaration(node) &&
    program.ast.text(program.ast.name(node)) === "authored");
  const authoredParameter = program.ast.parameters(authoredDeclaration)[0];
  return { scope, source, signatureDeclaration, openContract, sourceParameter, program, queries, file, carrier, direct,
    authoredDeclaration, authoredParameter };
}

test("declared parameter reads require their explicit domain without admitting a runtime source callee", () => {
  const { scope, source, openContract, file } = fixture(undefined, true);
  let declarationReads = 0;
  let calleeReads = 0;
  scope.host.representations.sourceCallable = (selected, sourceFile, selection) => {
    assert.equal(selected === source && sourceFile === file && selection === "checked", true,
      "the original checked declaration is the only parameter authority");
    declarationReads++;
    return openContract;
  };
  scope.resolveSourceCallContract = () => { calleeReads++; return { kind: "rejected" }; };
  assert.equal(resolveSourceCallParameter(scope, source, 0, file, "declared") === outer, true);
  assert.equal(declarationReads === 1 && calleeReads === 0, true,
    "a declared input does not admit a runtime receiver");
  assert.equal(resolveSourceCallParameter(scope, source, 0, file, "callable") === undefined, true);
  assert.equal(declarationReads === 1 && calleeReads === 1, true,
    "a source value still requires its own callee admission");
  for (const domain of [undefined, null, "checked", ""]) {
    assert.equal(resolveSourceCallParameter(scope, source, 0, file, domain) === undefined, true,
      `invalid read domain ${String(domain)}`);
  }
  assert.equal(resolveSourceCallParameter(scope, source, 0, file) === undefined, true,
    "the removed omitted-domain form refuses");
  assert.equal(declarationReads === 1 && calleeReads === 1, true);
});

test("stored aliases use their selected closed input and result, not creation templates", () => {
  for (const type of [integer, string]) {
    for (const carrier of [csharpDelegateTargetType("System.Func", [type], type),
      csharpNullableTargetType(csharpDelegateTargetType("System.Func", [type], type))]) {
      const { scope, source, signatureDeclaration, sourceParameter, file } = fixture(carrier);
      for (const selection of ["checked", "implementation"]) {
        const selected = scope.resolveSourceCallContract(source, file, { depth: 0 }, selection);
        assert.equal(selected.kind, "value");
        assert.equal(selected.contract.sourceDeclaration === signatureDeclaration, true, "exact signature provenance");
        assert.equal(selected.contract.nativeParameters[0].sourceParameter === sourceParameter, true, "exact argument correspondence");
        assert.equal(targetTypeRefEquals(selected.contract.returnType, type), true, "closed result");
        assert.equal(csharpFreeTypeParameterIdentities([selected.contract.returnType]).size, 0, "no free creation binder");
        assert.equal(Object.isFrozen(selected.contract.nativeParameters[0].targetParameter), true);
      }
      assert.equal(targetTypeRefEquals(resolveSourceCallParameter(scope, source, 0, file, "callable"), type), true);
      assert.equal(targetTypeRefEquals(resolveSourceCallParameters(scope, source, file)[0].type, type), true);
      assert.equal(targetTypeRefEquals(resolveSourceCallArgumentParameter(scope, source,
        { sourceParameterIndex: 0, effectiveArgumentIndex: 0, sourceForm: "value" }, file), type), true);
      const result = resolveSourceCallResultWithState(scope, source, file, { depth: 0 }, undefined);
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
    const { scope, source, file } = current;
    scope.resolveSelectedValueWithState = () => substituteTargetTypeParameters(value, new Map([[outer.identity, environment]]));
    const selected = scope.resolveSourceCallContract(source, file, { depth: 0 }, "checked");
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
    assert.deepEqual(resolveSourceCallTypeArguments(scope, source, file), [integer]);
  }
});

test("published closed source inputs retain authored omission across a required external signature", () => {
  const optional = csharpNullableTargetType(integer);
  const current = fixture(csharpDelegateTargetType("System.Func", [optional], integer, { optionalParameterIndexes: [0] }));
  const authoredParameter = current.authoredParameter;
  const closed = { ...current.openContract, sourceDeclaration: current.authoredDeclaration, parameters: [authoredParameter],
    nativeParameters: [{ sourceParameter: authoredParameter,
      targetParameter: { name: "value", type: optional, passingMode: "by-value", optional: true } }], returnType: integer };
  current.scope.host.representations.closedInputContract = expression => {
    assert.equal(expression === current.source.sourceCallee.expression, true, "lookup follows the actual stored operand");
    return closed;
  };
  for (const selection of ["checked", "implementation"]) {
    const selected = current.scope.resolveSourceCallContract(current.source, current.file, { depth: 0 }, selection);
    assert.equal(selected.kind === "declaration" && selected.closedInput === true && selected.contract === closed, true,
      "one published native implementation, not the external required input or a creation template");
  }
  assert.equal(resolveSourceCallParameter(current.scope, current.source, 0, current.file, "callable") === optional, true,
    "the checked external parameter maps to its proven physical input without a declaration-identity guess");
  const parameters = resolveSourceCallParameters(current.scope, current.source, current.file);
  assert.equal(parameters.length === 1 && parameters[0].optional === true && parameters[0].type === optional, true,
    "self omission and external present calls share the exact optional native slot");
  const catalog = current.program.ast.statements(current.file).find(node => current.program.ast.is.IsClassDeclaration(node));
  const foreignBinder = current.program.ast.typeParameters(catalog)[0];
  current.source = { ...current.source, sourceSelectedMethodTypeArguments: [{
    typeParameter: current.queries.declarations.declaredType(foreignBinder),
  }] };
  assert.equal(current.scope.resolveSourceCallContract(current.source, current.file, { depth: 0 }, "checked").kind, "rejected",
    "a nongeneric closed input cannot discard a checked invocation binder");
});

test("a published source contract cannot authorize a different native stored input", () => {
  const current = fixture();
  current.scope.host.representations.closedInputContract = () => current.openContract;
  assert.equal(current.scope.resolveSourceCallContract(current.source, current.file, { depth: 0 }, "checked").kind, "rejected",
    "an open creation binder does not match the closed physical stored operand");
  assert.equal(resolveSourceCallParameters(current.scope, current.source, current.file) === undefined, true,
    "a known contradictory publication never falls back to another input representation");
});

test("missing or inconsistent stored evidence rejects without a declaration fallback", () => {
  for (const carrier of [undefined, integer, csharpDelegateTargetType("System.Func", [], integer)]) {
    const { scope, source, file } = fixture();
    scope.resolveSelectedValueWithState = () => carrier;
    assert.equal(scope.resolveSourceCallContract(source, file, { depth: 0 }, "checked").kind, "rejected");
    assert.equal(resolveSourceCallParameter(scope, source, 0, file, "callable") === undefined, true);
    assert.equal(resolveSourceCallParameters(scope, source, file) === undefined, true);
    assert.equal(resolveSourceCallResultWithState(scope, source, file, { depth: 0 }, undefined) === undefined, true);
  }
});

test("direct declarations retain their native ABI and stored optional/rest metadata remains exact", () => {
  const { scope, source, openContract, file } = fixture(undefined, true);
  const selected = scope.resolveSourceCallContract(source, file, { depth: 0 }, "checked");
  assert.equal(selected.kind, "declaration");
  assert.equal(selected.contract === openContract, true, "direct declaration authority");
  const optional = csharpNullableTargetType(integer);
  const stored = fixture(csharpDelegateTargetType("System.Action", [optional], undefined,
    { optionalParameterIndexes: [0] }), false, { optional: true });
  const contract = resolveSourceCallParameters(stored.scope, stored.source, stored.file);
  assert.equal(contract[0].optional, true);
  assert.equal(contract[0].paramsArray, false);
  assert.equal(targetTypeRefEquals(resolveSourceCallArgumentParameter(stored.scope, stored.source,
    { sourceParameterIndex: 0, effectiveArgumentIndex: 0, sourceForm: "value" }, stored.file), optional), true);
  const sequence = { kind: "array", element: integer };
  const rest = fixture(csharpDelegateTargetType("System.Action", [sequence], undefined, { restParameterIndex: 0 }), false, { rest: true });
  const restContract = resolveSourceCallParameters(rest.scope, rest.source, rest.file);
  assert.equal(restContract[0].paramsArray, true);
  assert.equal(restContract[0].optional, false);
  for (const sourceForm of ["value", "spread-element", "spread-sequence"]) {
    assert.equal(targetTypeRefEquals(resolveSourceCallArgumentParameter(rest.scope, rest.source,
      { sourceParameterIndex: 0, effectiveArgumentIndex: 0, sourceForm }, rest.file), sourceForm === "spread-sequence" ? sequence : integer), true,
      sourceForm);
  }
});

test("checked callable evidence keeps variadic omission separate from optional native slots", () => {
  const { program, file } = fixture();
  const sequence = { kind: "array", element: integer };
  const scope = { host: { ast: program.ast, representations: {
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
      { sourceFile: file }, { depth: 0 });
    assert.equal(selected !== undefined, true, "one exact native callable");
    assert.equal(selected.csharpDelegateSignature.restParameterIndex, parameters.length - 1);
    assert.deepEqual(selected.csharpDelegateSignature.optionalParameterIndexes ?? [],
      parameters[0] === optional ? [0] : []);
    assert.equal(selected.csharpDelegateSignature.parameters.at(-1) === sequence, true, "unchanged rest carrier");
  }
  for (const parameters of [[rest, required], [rest, rest]]) {
    assert.equal(resolveCallableEvidence(scope, { parameters, result: { selectedType: integer } },
      { sourceFile: file }, { depth: 0 }) === undefined, true, "malformed rest ABI rejected");
  }
});

test("direct selected rest declarations also retain the distinct native variadic slot", () => {
  const { scope, source, file } = fixture(undefined, true, { rest: true });
  const sequence = { kind: "array", element: integer };
  scope.resolveSourceCallContract = () => ({ kind: "declaration" });
  scope.resolveSourceCallSelectedType = () => sequence;
  const parameters = resolveSourceCallParameters(scope, source, file);
  assert.equal(parameters.length, 1);
  assert.equal(parameters[0].type === sequence, true, "exact native sequence carrier");
  assert.equal(parameters[0].paramsArray, true);
  assert.equal(parameters[0].optional, false, "rest omission never becomes a CLR default");
});

function checkedBinders(current, count = 2) {
  Object.assign(current, fixture(current.carrier, current.direct, { genericCount: count === 4 ? 2 : 1 }));
  const { scope, program, queries, signatureDeclaration } = current;
  const checked = program.ast.typeParameters(signatureDeclaration);
  const catalog = program.ast.statements(current.file).find(node => program.ast.is.IsClassDeclaration(node));
  const native = program.ast.typeParameters(catalog);
  const declarations = count === 4 ? [...native, ...checked] : [checked[0], native[0]];
  assert.equal(declarations.length, count);
  assert.equal(declarations.every(declaration => declaration !== undefined && program.ast.is.IsTypeParameterDeclaration(declaration)), true,
    "every Native and checked binder is a real declaration in the same retained call's checked program");
  scope.host.typeParameterConstraints = createCsharpSourceTypeParameterEnvironment(program.ast,
    () => Object.freeze({ kind: "resolved", constraints: Object.freeze([]) }));
  scope.sourceCallableTypeParametersMatch = (...arguments_) => sourceCallableTypeParametersMatch(scope, ...arguments_);
  return declarations.map(declaration => ({ declaration, checkedType: queries.declarations.declaredType(declaration),
    type: csharpSourceTypeParameter(declaration, program.ast) }));
}

function retainedProtocol(current, signature, parameters) {
  let protocol;
  const value = retainCsharpGenericCallableValue(signature, parameters, shape => { protocol = shape; return shape; },
    createCsharpTypeParameterEnvironment(() => ({ kind: "resolved", constraints: [] })));
  current.scope.host.structuralTypes = { resolveTarget: owner => protocol === undefined ? undefined
    : instantiateCsharpObjectShape(protocol, owner) };
  return value;
}

test("stored invocation validates exact checked binder identities and native projections", () => {
  const ordinary = fixture();
  const ordinaryBinders = checkedBinders(ordinary);
  assert.equal(ordinary.scope.resolveSourceCallContract(ordinary.source, ordinary.file, { depth: 0 }, "checked").kind, "rejected",
    "ordinary storage cannot discard selected invocation binders");
  const current = fixture();
  const parameters = checkedBinders(current);
  const signature = csharpDelegateTargetType("System.Func", [parameters[0].type], parameters[0].type);
  const value = retainedProtocol(current, signature,
    [{ ...parameters[0].type, declaration: parameters[0].declaration, constraints: [] }]);
  current.scope.resolveSelectedValueWithState = () => value;
  for (const selected of [[], [parameters[1]], [parameters[0], parameters[1]], [parameters[1], parameters[0]]]) {
    current.source = { ...current.source, sourceSelectedMethodTypeArguments: selected.map(parameter => ({ typeParameter: parameter.checkedType })) };
    assert.equal(current.scope.resolveSourceCallContract(current.source, current.file, { depth: 0 }, "checked").kind, "rejected",
      "absent, foreign, extra or reordered invocation evidence");
  }
  current.source = current.program.semantics.forNode(current.source.call).operations.call(current.source.call);
  assert.equal(current.scope.resolveSourceCallContract(current.source, current.file, { depth: 0 }, "checked").kind, "value");
  const projection = csharpProjectedType({ kind: "optional", part: "storage", arguments: [parameters[0].type] });
  current.scope.host.representations.genericProjections = () => [projection];
  assert.equal(current.scope.resolveSourceCallContract(current.source, current.file, { depth: 0 }, "checked").kind, "rejected",
    "unexpected native projection cannot be dropped");
  const projected = retainedProtocol(current, signature,
    [{ ...parameters[0].type, declaration: parameters[0].declaration, constraints: [] },
      { ...projection, declaration: current.signatureDeclaration, constraints: projection.csharpProjectionConstraints }]);
  current.scope.resolveSelectedValueWithState = () => projected;
  assert.equal(current.scope.resolveSourceCallContract(current.source, current.file, { depth: 0 }, "checked").kind, "value",
    "exact selected method and projected binder family");
  const direct = fixture(undefined, true);
  checkedBinders(direct);
  assert.equal(sourceCallableTypeParametersMatch(direct.scope, direct.source, direct.openContract, "declaration"), true,
    "nongeneric implementation of a checked generic overload retains its declaration ABI");
});

test("stored value calls alpha-bind complete checked quantifiers without changing native owners", () => {
  const current = fixture();
  const [native, unusedNative, checked, unusedChecked] = checkedBinders(current, 4);
  const signature = csharpDelegateTargetType("System.Func", [native.type], { kind: "tuple", elements: [outer, native.type] });
  const value = retainedProtocol(current, signature, [native, unusedNative].map(parameter =>
    ({ ...parameter.type, declaration: parameter.declaration, constraints: [] })));
  const closed = substituteTargetTypeParameters(value, new Map([[outer.identity, integer]]));
  current.scope.resolveSelectedValueWithState = () => closed;
  const selected = current.scope.resolveSourceCallContract(current.source, current.file, { depth: 0 }, "checked");
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
  assert.equal(current.scope.resolveSourceCallContract(current.source, current.file, { depth: 0 }, "checked").kind, "value",
    "the first interned alpha-equivalent protocol's declaration IDs do not replace this selected invocation's binders");
  const contradictory = csharpMethodValueType(closed.csharpMethodValue.owner, closed.csharpMethodValue.method,
    closed.csharpMethodValue.identity, csharpDelegateTargetType("System.Func", [native.type],
      { kind: "tuple", elements: [string, native.type] }), [native.type.identity, unusedNative.type.identity]);
  current.scope.resolveSelectedValueWithState = () => contradictory;
  assert.equal(current.scope.resolveSourceCallContract(current.source, current.file, { depth: 0 }, "checked").kind, "rejected",
    "alpha-normalizing invocation binders never changes the captured native owner payload");
  current.scope.resolveSelectedValueWithState = () => closed;
  const original = current.scope.host.structuralTypes.resolveTarget;
  current.scope.host.structuralTypes.resolveTarget = () => undefined;
  assert.equal(current.scope.resolveSourceCallContract(current.source, current.file, { depth: 0 }, "checked").kind, "rejected",
    "a missing native invocation cannot be repaired by binder arity or spelling");
  current.scope.host.structuralTypes.resolveTarget = owner => {
    const protocol = original(owner);
    return { ...protocol, members: [...protocol.members, ...protocol.members] };
  };
  assert.equal(current.scope.resolveSourceCallContract(current.source, current.file, { depth: 0 }, "checked").kind, "rejected",
    "ambiguous native invocation evidence is refused independently");
  current.scope.host.structuralTypes.resolveTarget = original;
  current.source = { ...current.source, sourceSelectedMethodTypeArguments: [native, unusedNative].map(parameter => ({ typeParameter: parameter.checkedType })) };
  assert.equal(current.scope.resolveSourceCallContract(current.source, current.file, { depth: 0 }, "checked").kind, "rejected",
    "matching native IDs cannot stand in for the actual checked declaration's foreign binders");
});

test("stored value alpha-binding preserves nested projection geometry and native slot order", () => {
  const current = fixture();
  const [native, unusedNative, checked, unusedChecked] = checkedBinders(current, 4);
  const nativeDeclaration = current.program.ast.parent(native.declaration);
  const nativeStorage = csharpProjectedType({ kind: "optional", part: "storage", arguments: [native.type] });
  const nativeOperations = csharpProjectedType({ kind: "optional", part: "operations", arguments: [native.type] });
  const nativeNested = csharpProjectedType({ kind: "optional", part: "storage", arguments: [nativeStorage] });
  const checkedStorage = csharpProjectedType({ kind: "optional", part: "storage", arguments: [checked.type] });
  const checkedOperations = csharpProjectedType({ kind: "optional", part: "operations", arguments: [checked.type] });
  const checkedNested = csharpProjectedType({ kind: "optional", part: "storage", arguments: [checkedStorage] });
  current.scope.host.representations.genericProjections = declaration => declaration === nativeDeclaration
    ? [nativeOperations, nativeNested, nativeStorage] : declaration === current.signatureDeclaration
      ? [checkedStorage, checkedNested, checkedOperations] : [];
  const signature = csharpDelegateTargetType("System.Func", [native.type], native.type);
  const parameters = [native, unusedNative].map(parameter => ({ ...parameter.type, declaration: parameter.declaration, constraints: [] }));
  parameters.push(...[nativeOperations, nativeNested, nativeStorage].map(parameter =>
    ({ ...parameter, declaration: nativeDeclaration, constraints: parameter.csharpProjectionConstraints })));
  const value = retainedProtocol(current, signature, parameters);
  current.scope.resolveSelectedValueWithState = () => value;
  const selected = current.scope.resolveSourceCallContract(current.source, current.file, { depth: 0 }, "checked");
  assert.equal(selected.kind, "value", "complete nested native projections are related by semantic geometry");
  assert.deepEqual(selected.contract.nativeSignature.methodTypeParameterIdentities,
    [checked.type.identity, unusedChecked.type.identity, checkedOperations.identity, checkedNested.identity, checkedStorage.identity],
    "checked discovery order cannot replace the original native entry's projection slot order");
  const original = current.scope.host.representations.genericProjections;
  current.scope.host.representations.genericProjections = declaration => declaration === current.signatureDeclaration
    ? [checkedStorage, checkedStorage, checkedOperations] : original(declaration);
  assert.equal(current.scope.resolveSourceCallContract(current.source, current.file, { depth: 0 }, "checked").kind, "rejected",
    "a duplicate projection cannot replace the complete nested tail");
});

test("native value invocation keeps unused constraint proof and rejects corrupted anti-constraints", () => {
  for (const constrained of [false, true]) {
    const current = fixture();
    const [native, unusedNative, checked, unusedChecked] = checkedBinders(current, 4);
    const value = retainedProtocol(current, csharpDelegateTargetType("System.Func", [native.type], native.type),
      [{ ...native.type, declaration: native.declaration, constraints: [] },
        { ...unusedNative.type, declaration: unusedNative.declaration,
          constraints: constrained ? [{ kind: "keyword", keyword: "class" }] : [] }]);
    current.scope.resolveSelectedValueWithState = () => value;
    assert.equal(current.scope.resolveSourceCallContract(current.source, current.file, { depth: 0 }, "checked").kind,
      constrained ? "rejected" : "value", "unused native constraints cannot be dropped by signature-only matching");
    current.scope.resolveSelectedValueWithState = () => ({ ...value,
      csharpMethodValue: { ...value.csharpMethodValue, allowsRefLikeTypeArguments: [] } });
    assert.equal(current.scope.resolveSourceCallContract(current.source, current.file, { depth: 0 }, "checked").kind, "rejected",
      "an incomplete native anti-constraint vector is not a valid identity case");
  }
});

test("selected stored contracts do not require invented signature or parameter syntax", () => {
  const current = fixture();
  const { scope, file } = current;
  const source = { ...current.source, sourceSelectedSignatureParameters: current.source.sourceSelectedSignatureParameters.map(parameter =>
    ({ ...parameter, parameterDeclaration: undefined })) };
  const original = scope.host.semantics(current.file);
  scope.host.semantics = () => ({ ...original, declarations: { ...original.declarations, signatureDeclaration: () => undefined } });
  const selected = scope.resolveSourceCallContract(source, file, { depth: 0 }, "checked");
  assert.equal(selected.kind, "value", "exact native and selected semantic parameter correspondence");
  assert.equal(selected.contract.sourceDeclaration === undefined, true);
  assert.equal(selected.contract.nativeParameters[0].sourceParameter === undefined, true);
  assert.equal(targetTypeRefEquals(resolveSourceCallParameter(scope, source, 0, file, "callable"), integer), true);
});

test("native invocation arguments retain their complete projected order independently of checked inventory order", () => {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: {
    "/src/node_modules/@fixture/words/package.json": JSON.stringify({ name: "@fixture/words", version: "1.0.0",
      type: "module", exports: { ".": "./index.d.ts" } }),
    "/src/node_modules/@fixture/words/index.d.ts": "export type int64 = bigint;",
    "/src/index.ts": 'declare function invoke<Item>(): Item; invoke<import("@fixture/words").int64>();',
  }, compilerOptions: { strict: true, target: "es2022", module: "esnext", moduleResolution: "bundler" },
  extensionHostOptions: { extensions: [createSourceSemanticsExtension({ modules: [{
    moduleSpecifier: "@fixture/words", packageName: "@fixture/words",
    exports: [sourcePrimitive("int64", "int64", "bigint", true, 64)],
  }] })] } }).checkSource();
  assert.equal(checked.diagnostics.length, 0, formatDiagnostics(checked.diagnostics.filter(issue => issue !== undefined)).slice(0, 2048));
  assert.equal(checked.extensionDiagnostics.length, 0, "the authored native-width import has real Source extension evidence");
  const program = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  assert.equal(file !== undefined, true, "the original checked invocation file is retained");
  const calls = [];
  const visit = node => {
    if (program.ast.is.IsCallExpression(node)) calls.push(node);
    program.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  assert.equal(calls.length, 1, "the Native projection fixture has one exact checked invocation");
  const source = program.semantics.forNode(calls[0]).operations.call(calls[0]);
  assert.equal(source?.call === calls[0], true, "the required Host index reads the same original selected call");
  const queries = program.semantics.forNode(calls[0]);
  const signatureDeclaration = queries.declarations.signatureDeclaration(source.selectedSignature);
  const parameterDeclaration = signatureDeclaration === undefined ? undefined : program.ast.typeParameters(signatureDeclaration)[0];
  assert.equal(parameterDeclaration !== undefined, true, "the generic parameter is the original selected declaration's binder");
  const parameter = { declaration: parameterDeclaration, type: csharpSourceTypeParameter(parameterDeclaration, program.ast) };
  assert.equal(parameter.type !== undefined, true, "the Native binder keeps the real Source declaration identity");
  const storage = csharpProjectedType({ kind: "optional", part: "storage", arguments: [parameter.type] });
  const operations = csharpProjectedType({ kind: "optional", part: "operations", arguments: [parameter.type] });
  const current = { source, openContract: { kind: "source", sourceDeclaration: signatureDeclaration,
    parameters: [], nativeParameters: [], returnType: parameter.type }, scope: {
    host: { ast: program.ast, effectiveTypes: program.effectiveTypes, navigation: program.navigation,
      semantics: sourceFile => program.semantics.forFile(sourceFile), semanticsFor: node => program.semantics.forNode(node),
      typeParameterConstraints: createCsharpSourceTypeParameterEnvironment(program.ast,
        () => Object.freeze({ kind: "resolved", constraints: Object.freeze([]) })),
      representations: { genericProjections: () => [storage, operations] } },
    resolveAuthoredAndSelectedSourceType: () => integer,
  } };
  current.openContract.nativeSignature = Object.freeze({ methodTypeParameterIdentities: [
    parameter.type.identity, operations.identity, storage.identity], methodAllowsRefLikeTypeArguments: [false, false, false] });
  assert.equal(sourceCallableTypeParametersMatch(current.scope, current.source, current.openContract, "declaration"), true,
    "the complete exact projection family is independent of discovery order");
  const selected = resolveSourceCallInstantiation(current.scope, current.source, file, { depth: 0 },
    current.openContract.nativeSignature.methodTypeParameterIdentities, current.openContract);
  assert.equal(selected !== undefined, true, "the complete native invocation is admitted");
  assert.equal(selected.arguments.length, 3, "neither native projection is dropped");
  assert.equal(targetTypeRefEquals(selected.arguments[0], integer), true, "the original authored invocation retains its exact native argument");
  assert.equal(selected.arguments[0] === selected.substitutions.get(parameter.type.identity), true,
    "the original authored binder retains the identical selected invocation argument");
  assert.equal(selected.arguments[1] === selected.substitutions.get(operations.identity), true,
    "the actual native operations slot precedes storage in this invocation");
  assert.equal(selected.arguments[2] === selected.substitutions.get(storage.identity), true,
    "the actual native storage slot is not replaced by discovery order");
  current.scope.host.representations.genericProjections = () => [storage, storage];
  assert.equal(sourceCallableTypeParametersMatch(current.scope, current.source, current.openContract, "declaration"), false,
    "a duplicate cannot stand in for a missing native projection");
  assert.equal(resolveSourceCallInstantiation(current.scope, current.source, file, { depth: 0 },
    current.openContract.nativeSignature.methodTypeParameterIdentities, current.openContract) === undefined, true,
  "instantiation independently rejects the incomplete projection family");
});

test("checked narrow overload arguments use the selected native implementation carrier", () => {
  const current = fixture(undefined, true);
  const native = { kind: "tuple", elements: [integer, string] };
  current.openContract.nativeParameters[0].targetParameter.type = native;
  const argument = { sourceParameterIndex: 0, effectiveArgumentIndex: 0, sourceForm: "value" };
  assert.equal(targetTypeRefEquals(resolveSourceCallArgumentParameter(current.scope, current.source, argument, current.file), native), true,
    "the selected implementation owns physical argument storage");
  assert.equal(resolveSourceCallArgumentParameter(current.scope, current.source, { ...argument, effectiveArgumentIndex: 3 }, current.file) === undefined, true,
    "missing implementation slots cannot fall back to a checked narrow carrier");
});

test("native overload binders remap only through exact checked implementation correspondence", () => {
  const checkedFixture = extra => {
    const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: { "/src/index.ts": `
      function invoke<Checked>(value: Checked): Checked;
      function invoke<Native${extra ? ", Extra" : ""}>(value: Native): Native { return value; }
      declare function foreign<Other>(value: Other): Other;
      invoke(1);`,
    }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
    assert.equal(checked.diagnostics.length, 0);
    const program = createTargetSourceProgram(checked);
    const file = checked.getSourceFile("/src/index.ts");
    const call = program.ast.as.AsExpressionStatement(program.ast.statements(file).at(-1)).Expression;
    const queries = program.semantics.forFile(file);
    const source = queries.operations.call(call);
    const selected = queries.declarations.signatureDeclaration(source.selectedSignature);
    const implementation = program.navigation.callableImplementation(selected).implementation.declaration;
    const foreign = program.ast.statements(file).find(node => program.ast.is.IsFunctionDeclaration(node) &&
      program.ast.text(program.ast.name(node)) === "foreign");
    const native = csharpSourceTypeParameter(program.ast.typeParameters(implementation)[0], program.ast);
    const foreignParameter = program.ast.typeParameters(foreign)[0];
    const contract = { sourceDeclaration: implementation,
      nativeSignature: { methodTypeParameterIdentities: [native.identity] } };
    const scope = { host: { ast: program.ast, navigation: program.navigation, effectiveTypes: program.effectiveTypes,
      typeParameterConstraints: createCsharpSourceTypeParameterEnvironment(program.ast, declaration => {
        assert.equal(program.ast.as.AsTypeParameterDeclaration(declaration).Constraint, undefined,
          "the real overload binders have no authored constraints");
        return Object.freeze({ kind: "resolved", constraints: Object.freeze([]) });
      }),
      moduleCallables: { get: () => undefined }, semantics: () => queries, representations: { genericProjections: () => [] } } };
    return { scope, source, contract, foreign, foreignParameter, queries };
  };
  const current = checkedFixture(false);
  assert.equal(sourceCallableTypeParametersMatch(current.scope, current.source, current.contract, "declaration"), true,
    "different authored binder names preserve the exact native implementation slot");
  const foreign = { ...current.source, sourceSelectedMethodTypeArguments: [{
    ...current.source.sourceSelectedMethodTypeArguments[0],
    typeParameter: current.queries.declarations.declaredType(current.foreignParameter),
  }] };
  assert.equal(sourceCallableTypeParametersMatch(current.scope, foreign, current.contract, "declaration"), false,
    "a foreign binder is not accepted merely because its target identity matches");
  assert.equal(sourceCallableTypeParametersMatch(current.scope, current.source,
    { ...current.contract, sourceDeclaration: current.foreign }, "declaration"), false,
    "unrelated native declarations cannot own the checked overload");
  const extra = checkedFixture(true);
  assert.equal(sourceCallableTypeParametersMatch(extra.scope, extra.source, extra.contract, "declaration"), false,
    "implementation arity cannot be repaired through binder spelling or a partial prefix");
});

test("bulk parameter resolution selects the complete stored contract once", () => {
  const { scope, source, file } = fixture(csharpDelegateTargetType("System.Func", Array(12).fill(integer), integer), false, { parameterCount: 12 });
  const select = scope.resolveSourceCallContract;
  let selections = 0;
  scope.resolveSourceCallContract = (...arguments_) => { selections += 1; return select(...arguments_); };
  const parameters = resolveSourceCallParameters(scope, source, file);
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
  const { scope, source, file } = fixture({ ...carrier, csharpDelegateSignature: {
    ...carrier.csharpDelegateSignature, optionalParameterIndexes: indexes,
  } }, false, { parameterCount: count, optional: true });
  const parameters = resolveSourceCallParameters(scope, source, file);
  assert.equal(parameters.length, count);
  assert.equal(parameters.every(parameter => parameter.optional && targetTypeRefEquals(parameter.type, optional)), true);
});

test("super construction obtains its exact selected native base environment", () => {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: { "/src/index.ts": `
    class Base<Item> {}
    class Derived extends Base<number> { constructor() { super(); } }`,
  }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0);
  const program = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  const owner = program.ast.statements(file).find(node => program.ast.is.IsClassDeclaration(node) &&
    program.ast.text(program.ast.name(node)) === "Derived");
  let call;
  const visit = node => {
    if (program.ast.is.IsCallExpression(node) && program.ast.kindName(program.ast.as.AsCallExpression(node)?.Expression) === "KindSuperKeyword") call = node;
    program.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(owner);
  const source = program.semantics.forNode(call).operations.call(call);
  assert.equal(source.call === call, true, "the Native construction uses the same retained checked super call");
  const base = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: "fixture.Base", typeArguments: [integer] };
  const selected = resolveSourceCallReceiverTargetType({ host: {
    ast: program.ast, effectiveTypes: program.effectiveTypes, semanticsFor: node => program.semantics.forNode(node),
    projectTypeCatalog: { definitionForDeclaration: declaration => {
      assert.equal(declaration === owner, true, "the actual construction class owns its native environment");
      return { declaration: owner, typeParameterBindings: [] };
    }, targetTypeForDeclaration: declaration => {
      assert.equal(declaration === owner, true, "heritage instantiation consumes the exact enclosing class identity");
      return base;
    } },
  }, resolveNodeWithState: () => assert.fail("super is construction syntax, never a runtime value lookup"),
  }, source, file, { depth: 0 });
  assert.equal(selected === base, true, "heritage instantiation stays at the existing receiver owner");
});
