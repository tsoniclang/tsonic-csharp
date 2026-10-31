import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, formatDiagnostics } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { analyzeCsharpCaptureStorage } from "../../../dist/analysis/callables/storage/capture-storage.js";
import { analyzeCsharpCallableCreations } from "../../../dist/analysis/callables/values/creation.js";
import { analyzeCsharpNativeParticipation } from "../../../dist/analysis/callables/calls/participation.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

const scalar = Object.freeze({ kind: "source-primitive", name: "float64" });
const callable = csharpDelegateTargetType("System.Func", [scalar], scalar);

function fixture(body, quotation = false) {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/project",
    files: { "/project/index.ts": `
      declare function invoke(mapper: (value: number) => number): number;
      declare function unknown(mapper: (value: number) => number): number;
      export function run(value: number) { ${body} }
    ` }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0, formatDiagnostics(checked.diagnostics.slice(0, 4)).slice(0, 1024));
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/project/index.ts");
  assert.equal(file !== undefined, true, "checked source file");
  const lambdas = [];
  const calls = [];
  const declarations = new Map();
  const nodes = [];
  const visit = node => {
    nodes.push(node);
    if (source.ast.is.IsArrowFunction(node) || source.ast.is.IsFunctionExpression(node)) lambdas.push(node);
    if (source.ast.is.IsCallExpression(node)) calls.push(node);
    if (source.ast.is.IsFunctionDeclaration(node)) declarations.set(source.ast.text(source.ast.name(node)), node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  const target = quotation ? { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "Fixture::Quotation", csharpExpressionTreeDelegateType: callable } : undefined;
  const operations = new Map(calls.map(call => {
    const checkedCall = source.semantics.forNode(call).operations.call(call);
    const callee = source.ast.as.AsCallExpression(call)?.Expression;
    const declaration = callee === undefined ? undefined : source.navigation.sourceReferenceFor(callee)?.declaration;
    const parameter = { type: target ?? callable, passingMode: "by-value" };
    const arguments_ = checkedCall.sourceArgumentBindings.map(binding => ({
      sourceArgumentIndex: binding.sourceArgumentIndex, effectiveArgumentIndex: binding.effectiveArgumentIndex,
      sourceForm: binding.sourceForm, spreadElementIndex: binding.spreadElementIndex, targetParameter: parameter,
    }));
    const selected = declaration === declarations.get("invoke") ? { origin: "source-profile",
      invocationOnlyCallableArgumentIndexes: Object.freeze([0]),
      arguments: arguments_,
    } : { origin: "provider", invocationOnlyCallableArgumentIndexes: Object.freeze([0]),
      arguments: arguments_,
    };
    const sourceArgumentParameterTypes = checkedCall.sourceArgumentBindings.map(binding => {
      const arguments_ = selected.arguments.filter(argument => argument.sourceArgumentIndex === binding.sourceArgumentIndex &&
        argument.effectiveArgumentIndex === binding.effectiveArgumentIndex && argument.sourceForm === binding.sourceForm &&
        argument.spreadElementIndex === binding.spreadElementIndex);
      assert.equal(arguments_.length, 1, "one same selected native parameter per original checked binding");
      return arguments_[0].targetParameter.type;
    });
    return [call, { source: checkedCall, target: { kind: "resolved", call: Object.freeze(selected) },
      sourceArgumentParameterTypes: Object.freeze(sourceArgumentParameterTypes) }];
  }));
  const evidence = { compileTimeMetadata: { get: () => false },
    typeParameterConstraints: { get: () => [] },
    contextualType: { get: node => {
      const selectedType = source.semantics.forNode(node).types.expressionType(node);
      return selectedType === undefined ? undefined : { selectedType, targetType: target };
    } },
    nodeTargetType: { get: node => source.ast.is.IsArrowFunction(node) || source.ast.is.IsFunctionExpression(node) ? callable : scalar },
    storageTargetType: { get: () => undefined } };
  const storage = { nativeBacking: { get: () => undefined },
    nativeArray: { get: () => undefined },
    storageType: { get: () => undefined },
    typedLocationIdentity: { get: () => false } };
  assert.equal(lambdas.length, 1, "one exact authored callable");
  const lambda = lambdas[0];
  const parameters = source.ast.parameters(lambda);
  const contract = Object.freeze({ kind: "source", sourceDeclaration: lambda,
    nativeSignature: Object.freeze({ methodTypeParameterIdentities: [], methodAllowsRefLikeTypeArguments: [] }),
    parameters, nativeParameters: parameters.map(parameter => ({ sourceParameter: parameter,
      targetParameter: { name: source.ast.text(source.ast.name(parameter)), type: scalar, passingMode: "by-value" } })),
    returnType: scalar });
  const contracts = { get: identity => identity.declaration === lambda ? contract : undefined, closedInputType: () => undefined };
  const selected = analyzeCsharpCaptureStorage(source, { knownShapes: () => [] }, storage, evidence,
    [], contracts, { get: () => false });
  assert.equal(selected.issues.length === 0, true, "closed capture storage");
  const creations = analyzeCsharpCallableCreations({ source, nodes, captures: selected,
    contracts,
    operations: { selectedCall: { get: node => operations.get(node) }, selectedConstruction: { get: () => undefined } },
    storage: { lambdaParameterType: { get: parameter => parameters.includes(parameter) ? scalar : undefined },
      storageType: { get: declaration => source.ast.is.IsVariableDeclaration(declaration) ? callable : undefined } },
    expectedTypes: { requiredExpectedType: { get: () => [] } },
    evidence, conversions: { conversion: { get: (input, output) => targetTypeRefEquals(input, output) ? { kind: "identity" } : undefined } },
    literals: { literalValue: { get: () => undefined } } });
  return { selected: creations, captures: selected, lambda, operations, source, nodes, evidence };
}

function allocationFor(input) {
  const creation = input.selected.callableCreation.get(input.lambda);
  assert.equal(creation?.kind, "selected", "the actual original callable has one selected native creation");
  assert.equal(creation.carrier !== undefined, true, "form and carrier belong to the same completed fact");
  return creation.allocation;
}

for (const [name, body] of [
  ["inline argument", "return invoke((entry: number) => entry + 1);"],
  ["parenthesized argument", "return invoke(((entry: number) => entry + 1));"],
  ["satisfies argument", "return invoke(((entry: number) => entry + 1) satisfies ((value: number) => number));"],
  ["inline named recursion", "return invoke(function recurse(entry: number): number { return entry === 0 ? 1 : recurse(entry - 1); });"],
  ["immutable aliases", "const mapper = (entry: number) => entry + 1; const alias = mapper; invoke(alias); return invoke(mapper);"],
]) {
  test(`only sealed invocation arguments cache capture-free ${name}`, () => {
    const input = fixture(body);
    const selected = allocationFor(input);
    assert.equal(selected.kind, name === "immutable aliases" ? "fresh" : "cached", "approved C-1394: no all-use alias cache");
    assert.equal(selected.staticBody, true);
    assert.equal(Object.isFrozen(selected), true);
  });
}

for (const [name, body, staticBody = true] of [
  ["unknown destination", "return unknown((entry: number) => entry + 1);"],
  ["optional argument call", "return invoke?.((entry: number) => entry + 1);"],
  ["spread argument", "return invoke(...[(entry: number) => entry + 1]);"],
  ["mixed destination aliases", "const mapper = (entry: number) => entry + 1; const alias = mapper; invoke(alias); return unknown(mapper);"],
  ["observed identity", "const mapper = (entry: number) => entry + 1; const alias = mapper; invoke(alias); return mapper === alias;"],
  ["returned value", "const mapper = (entry: number) => entry + 1; invoke(mapper); return mapper;"],
  ["stored value", "const mapper = (entry: number) => entry + 1; invoke(mapper); return { mapper };"],
  ["writable alias", "let mapper = (entry: number) => entry + 1; return invoke(mapper);"],
  ["unproved declaration annotation", "const mapper: (entry: number) => number = entry => entry + 1; return invoke(mapper);"],
  ["named self value", "return invoke(function self(entry: number): number { const alias = self; return alias === self ? entry : -1; });", false],
]) {
  test(`${name} preserves fresh native creation despite stateless bodies`, () => {
    const input = fixture(body);
    const selected = allocationFor(input);
    assert.equal(selected.kind, "fresh");
    assert.equal(selected.staticBody, staticBody, "observed self values require their exact nonstatic identity binding");
  });
}

test("invocation-only captured callbacks use their native activation without static caches", () => {
  const input = fixture("return invoke((entry: number) => entry + value);");
  assert.equal(allocationFor(input).kind, "inline");
  assert.equal(allocationFor(input).staticBody, false);
});

test("missing callable creation evidence is an invariant, not a default allocation", () => {
  const input = fixture("return invoke((entry: number) => entry + 1);");
  assert.equal(input.selected.callableCreation.get({}) === undefined, true, "a foreign node has no fabricated native creation");
  assert.throws(() => analyzeCsharpNativeParticipation({ ast: input.source.ast,
    storage: { nodes: input.nodes, failureReason: () => undefined }, navigation: input.source.navigation,
    captureClosure: input.captures.captureClosure, callableCreation: { get: () => undefined },
    objectShapes: { resolveNode: () => undefined }, compileTimeMetadata: input.evidence.compileTimeMetadata,
    requiredRecords: [] }), error => error instanceof Error &&
    error.message === "Lambda creation requires its exact admitted native allocation decision.");
  assert.equal(Object.isFrozen(input.selected.callableCreation.get(input.lambda)), true);
});

for (const body of ["return invoke((entry: number) => entry + 1);", "return invoke((entry: number) => entry + value);"]) {
  test(`exact quotation evidence preserves syntax independently of delegate flow (${body})`, () => {
    const input = fixture(body, true);
    const selected = allocationFor(input);
    assert.equal(selected.kind, "quotation");
    assert.equal(selected.staticBody, false);
    assert.equal(input.captures.captureClosure.get(input.lambda) === undefined, true, "quotation has no native capture closure");
    assert.equal(Object.isFrozen(selected), true);
  });
}
