import { csharpSourceValueResult } from "../../../dist/analysis/source-evidence/types/resolution/call-results.js";
import assert from "node:assert/strict";
import test from "node:test";
import { isSourceOwnedCallableRuntimeCarrierSubject } from "../../../dist/analysis/source-evidence/types/resolution/source-ownership.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { publishedCsharpCallableInterface } from "../../../dist/analysis/source-evidence/types/published-callable-interface.js";
import { withCsharpSessionRequest, assertCsharpCompilationSucceeded, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { bindCsharpSourceTypeArguments } from "../../../dist/analysis/source-evidence/types/resolution/generic-arguments.js";
import { projectSourceDeclarationTargetType } from "../../../dist/analysis/source-evidence/types/resolution/project-types.js";
import { getCsharpDelegateSignature } from "../../../dist/target-model/types/carriers/delegates.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int32" });
const callable = csharpDelegateTargetType("System.Func", [integer], integer);

function fixture() {
  const file = {};
  const expression = {};
  const initializer = { kind: "identifier" };
  const declaration = { kind: "variable" };
  const implementation = { kind: "function", file, project: true };
  const signature = { declaration: implementation };
  const signatures = [signature];
  const input = {
    sourceFiles: [file],
    types: { resolveNode: () => ({ kind: "resolved", sourceResult: csharpSourceValueResult(callable) }) },
    navigation: {
      referenceFor: () => ({ declaration, sourceFile: file }),
      isProjectDeclaration: selected => selected.project === true,
      declarationUseSummary: () => { throw new Error("source authority must not invent a closed origin proof"); },
    },
    ast: {
      is: {
        IsDeclarationFile: selected => selected.declarationFile === true,
        IsVariableDeclaration: selected => selected.kind === "variable",
        IsBindingElement: () => false,
        IsFunctionExpression: selected => selected.kind === "function",
        IsFunctionTypeNode: selected => selected.kind === "function-type",
        IsArrowFunction: () => false,
        IsFunctionDeclaration: () => false,
        IsMethodDeclaration: () => false,
        IsConstructorDeclaration: () => false,
        IsParameterDeclaration: () => false,
        IsCallExpression: () => false,
      },
      as: { AsVariableDeclaration: () => ({ Initializer: initializer }) },
      isDeclarationFile: selected => selected.declarationFile === true,
      getSourceFile: selected => selected.file,
    },
    effectiveTypes: {
      get: selected => selected === initializer ? {
        kind: "resolved",
        type: { kind: "callable", calls: signatures, constructs: [] },
        provenance: { group: initializer, occurrence: initializer, sourceFile: file },
      } : undefined,
    },
  };
  return { input, file, expression, initializer, declaration, implementation, signatures };
}

test("inferred aliases retain exact checked source callable signature authority without claiming closed origins", () => {
  const selected = fixture();
  assert.equal(isSourceOwnedCallableRuntimeCarrierSubject(selected.expression, selected.file, selected.input), true);
  selected.signatures.push({ declaration: { ...selected.implementation } });
  assert.equal(isSourceOwnedCallableRuntimeCarrierSubject(selected.expression, selected.file, selected.input), true, "all selected overload declarations are source owned");
  selected.implementation.kind = "function-type";
  assert.equal(isSourceOwnedCallableRuntimeCarrierSubject(selected.expression, selected.file, selected.input), true, "authored source function signatures are authority, not closed origin evidence");
});

test("foreign, unresolved, mixed and declaration-only signatures do not manufacture source callable authority", () => {
  for (const mutate of [
    selected => selected.signatures.splice(0),
    selected => { selected.signatures[0].declaration = undefined; },
    selected => { selected.implementation.project = false; },
    selected => { selected.implementation.file = {}; },
    selected => { selected.implementation.file = { declarationFile: true }; selected.input.sourceFiles.push(selected.implementation.file); },
    selected => { selected.implementation.kind = "noncallable"; },
    selected => { selected.signatures.push({ declaration: { kind: "function", file: {}, project: false } }); },
    selected => { selected.input.types.resolveNode = () => ({ kind: "resolved", sourceResult: csharpSourceValueResult(integer) }); },
  ]) {
    const selected = fixture();
    mutate(selected);
    assert.equal(isSourceOwnedCallableRuntimeCarrierSubject(selected.expression, selected.file, selected.input), false, "exact source signature ownership required");
  }
});

test("callable interface classification consumes the complete published inventory without reopening a formal Type", () => {
  const { compiled, value } = withCsharpSessionRequest({ sourceText: `
    export interface Unary<Value> { (value: Value): Value; }
    export interface Concrete extends Unary<int64> {}
    export interface Mixed { (value: int64): int64; readonly count: int32; }
    export interface Factory { new(): Unary<int64>; }
  ` }, request => {
    const source = request.input.source;
    const declarations = source.navigation.nodes.filter(node => source.ast.is.IsInterfaceDeclaration(node) &&
      source.navigation.isProjectDeclaration(node));
    const host = {
      ast: source.ast, navigation: source.navigation, effectiveTypes: source.effectiveTypes,
      semanticsFor(node) {
        const queries = source.semantics.forNode(node);
        return { ...queries, declarations: { ...queries.declarations,
          declaredType() { assert.fail("published callable interfaces never reopen a formal Type"); } } };
      },
    };
    const concrete = declarations.find(declaration => source.ast.text(source.ast.name(declaration)) === "Concrete");
    const heritage = source.navigation.declaredHeritage(concrete);
    assert.equal(heritage.kind === "resolved" && heritage.edges.length === 1 && heritage.edges[0].typeArguments.length === 1, true,
      "the actual inherited application has one published originating type argument");
    const argumentNode = heritage.edges[0].typeArguments[0];
    let inheritedReads = 0;
    const scope = { host: { ...host, hasSemantics: source.semantics.includes, sourceFacts: source.sourceFacts,
      target: request.input.target }, resolveNodeWithState(node) {
        assert.equal(node === argumentNode, true, "the Native binder consumes only the actual published heritage argument");
        inheritedReads += 1;
        return { kind: "source-primitive", name: "int64" };
      } };
    const inherited = projectSourceDeclarationTargetType(scope, concrete, []);
    const inheritedParameter = getCsharpDelegateSignature(inherited)?.parameters[0];
    assert.equal(inheritedReads, 1, "the inherited application is lowered once");
    return declarations.map(declaration => {
      const selected = publishedCsharpCallableInterface(declaration, host);
      return { name: source.ast.text(source.ast.name(declaration)), selected: selected !== undefined,
        calls: selected?.type.calls.length ?? 0,
        parameter: declaration === concrete && inheritedParameter?.kind === "source-primitive" ? inheritedParameter.name
          : selected?.type.calls[0]?.parameters[0]?.type.kind === "primitive"
          ? selected.type.calls[0].parameters[0].type.primitive : null };
    });
  });
  assertCsharpCheckingSucceeded(compiled);
  assert.deepEqual(compiled.targetDiagnostics.map(diagnostic => ({ code: diagnostic.code, message: diagnostic.message })),
    [0, 1].map(() => ({ code: "CSHARP_UNSUPPORTED_AST", message: "Interface member is outside the current C# planning surface." })),
    "mixed-callable and construct interfaces keep their existing Native refusals rather than becoming pure callable interfaces");
  assert.equal(value.length, 4, "every authored interface is checked");
  assert.equal(value.find(row => row.name === "Unary")?.selected, true, "the open callable inventory remains callable");
  assert.equal(value.find(row => row.name === "Concrete")?.parameter, "int64", "the inherited published argument keeps its exact native width");
  assert.equal(value.find(row => row.name === "Mixed")?.selected, false, "a data member is not dropped to manufacture a pure callable");
  assert.equal(value.find(row => row.name === "Factory")?.selected, false, "a construct signature is not a call signature");
});

test("published callable interface selection rejects missing, foreign and unexpressible publications", () => {
  const { compiled, value } = withCsharpSessionRequest({ sourceText: `
    export interface Unary { (value: int32): int64; }
    export interface Foreign { (value: int32): int64; }
  ` }, request => {
    const source = request.input.source;
    const interfaces = source.navigation.nodes.filter(node => source.ast.is.IsInterfaceDeclaration(node) &&
      source.navigation.isProjectDeclaration(node));
    const declaration = interfaces.find(node => source.ast.text(source.ast.name(node)) === "Unary");
    const foreign = interfaces.find(node => source.ast.text(source.ast.name(node)) === "Foreign");
    assert.equal(declaration !== undefined && foreign !== undefined, true, "both original declarations exist");
    const outcome = source.effectiveTypes.get(declaration);
    assert.equal(outcome !== undefined && outcome.kind !== "refused" && outcome.type.kind === "declared", true,
      "the actual interface has its declared publication");
    const host = { ast: source.ast, navigation: source.navigation,
      semanticsFor: source.semantics.forNode, effectiveTypes: source.effectiveTypes };
    const cases = [undefined, { ...outcome, provenance: { ...outcome.provenance, occurrence: foreign } },
      { ...outcome, type: { ...outcome.type, declaration: foreign } },
      { ...outcome, type: { kind: "declared", declaration, typeArguments: [], cut: "unexpressible" } }];
    return cases.map(selected => publishedCsharpCallableInterface(declaration,
      { ...host, effectiveTypes: { ...source.effectiveTypes, get: () => selected } }) === undefined);
  });
  assertCsharpCompilationSucceeded(compiled);
  assert.deepEqual(value, [true, true, true, true], "missing identity or a cut cannot manufacture callable structure");
});

test("published call bindings retain only the identical existing checked binder reference without declaredType replay", () => {
  const { compiled, value } = withCsharpSessionRequest({ sourceText: `
    function identity<Value>(value: Value): Value { return value; }
    export function run(value: int32): int32 { return identity<int32>(value); }
  ` }, request => {
    const source = request.input.source;
    const callNode = source.navigation.nodes.find(node => source.ast.is.IsCallExpression(node) &&
      source.navigation.isProjectDeclaration(node));
    assert.equal(callNode !== undefined, true, "the original explicit call exists");
    const original = source.semantics.forNode(callNode);
    const call = original.operations.call(callNode);
    const publication = source.effectiveTypes.callInstantiation(callNode);
    assert.equal(call !== undefined && publication?.call === call && publication.method.length === 1, true,
      "one exact Source call and binder publication exist");
    const queries = { ...original, declarations: { ...original.declarations,
      declaredType() { assert.fail("published call bindings do not reopen a formal declared Type"); } } };
    const scope = { host: { ast: source.ast, effectiveTypes: source.effectiveTypes,
      navigation: source.navigation, target: request.input.target } };
    const selected = bindCsharpSourceTypeArguments(scope, call.sourceCallee.type, queries, { depth: 0 }, call);
    const binding = selected?.sourceBindings.get(publication.method[0].declaration);
    const foreignCall = { ...call };
    const foreign = bindCsharpSourceTypeArguments(scope, call.sourceCallee.type, queries, { depth: 0 }, foreignCall);
    const missing = bindCsharpSourceTypeArguments(scope, call.sourceCallee.type,
      { ...queries, declarations: { ...queries.declarations, symbolDeclarations: () => [] } }, { depth: 0 }, call);
    return { width: binding?.targetType.kind === "source-primitive" ? binding.targetType.name : null,
      exactReference: binding?.sourceType === call.sourceSelectedMethodTypeArguments[0].typeParameter,
      foreign: foreign === undefined, missing: missing === undefined };
  });
  assertCsharpCompilationSucceeded(compiled);
  assert.deepEqual(value, { width: "int32", exactReference: true, foreign: true, missing: true },
    "only the published Native width and exact existing checked binder reference are retained");
});
