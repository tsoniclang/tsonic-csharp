import { createCsharpCallableCreationProducer } from "../../../dist/analysis/program/records/callables/callable-creations.js";
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram } from "../../representation/host-fixture.mjs";
import { createCsharpTypeParameterEnvironment } from "../../../dist/representation/index.js";
import { analyzeCsharpCaptureStorage } from "../../../dist/analysis/callables/storage/capture-storage.js";
import { analyzeCsharpCallableCreations } from "../../../dist/analysis/callables/values/creation.js";
import { analyzeCsharpNativeParticipation } from "../../../dist/analysis/callables/calls/participation.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

const scalar = Object.freeze({ kind: "source-primitive", name: "float64" });
const callable = csharpDelegateTargetType("System.Func", [scalar], scalar);

function fixture(body, quotation = false) {
  // nextgen C-2542: a Host program; calls are Host call selections (facts.selections.call), callee identity is
  // facts.navigation.identity, contextual source types are facts.values.type descriptors.
  const program = hostProgram(`
      declare function invoke(mapper: (value: number) => number): number;
      declare function unknown(mapper: (value: number) => number): number;
      export function run(value: number) { ${body} }
    `);
  const source = Object.freeze({ syntax: program.ast, facts: program.facts, sourceFiles: program.files,
    sourceFacts: program.host.sourceFacts, documents: program.host.documents });
  const file = program.files[0];
  assert.equal(file !== undefined, true, "checked source file");
  const lambdas = [];
  const calls = [];
  const declarations = new Map();
  const nodes = [];
  const visit = node => {
    nodes.push(node);
    if (source.syntax.is.IsArrowFunction(node) || source.syntax.is.IsFunctionExpression(node)) lambdas.push(node);
    if (source.syntax.is.IsCallExpression(node)) calls.push(node);
    if (source.syntax.is.IsFunctionDeclaration(node)) declarations.set(source.syntax.text(source.syntax.name(node)), node);
    source.syntax.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  const target = quotation ? { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "Fixture::Quotation", csharpExpressionTreeDelegateType: callable } : undefined;
  const operations = new Map(calls.map(call => {
    const checkedCall = source.facts.selections.call(call);
    const callee = source.syntax.as.AsCallExpression(call)?.Expression;
    const declaration = callee === undefined ? undefined : source.facts.navigation.identity.target(callee)?.declaration;
    const parameter = { type: target ?? callable, passingMode: "by-value" };
    const authored = source.syntax.arguments(call);
    // One native argument per Host argument correspondence, at its correspondence position (F4 decision 2).
    const arguments_ = checkedCall.arguments.map((entry, index) => ({
      sourceArgumentIndex: authored.indexOf(entry.argument), effectiveArgumentIndex: index,
      sourceForm: entry.mode === "positional" ? "value" : entry.mode === "rest-element" ? "value" : "spread-sequence",
      targetParameter: parameter,
    }));
    const selected = declaration === declarations.get("invoke") ? { origin: "source-profile",
      invocationOnlyCallableArgumentIndexes: Object.freeze([0]),
      arguments: arguments_,
    } : { origin: "provider", invocationOnlyCallableArgumentIndexes: Object.freeze([0]),
      arguments: arguments_,
    };
    const sourceArgumentParameterTypes = checkedCall.arguments.map((entry, index) => {
      const arguments_ = selected.arguments.filter(argument => argument.effectiveArgumentIndex === index &&
        argument.sourceArgumentIndex === authored.indexOf(entry.argument));
      assert.equal(arguments_.length, 1, "one same selected native parameter per Host argument correspondence");
      return arguments_[0].targetParameter.type;
    });
    return [call, { source: checkedCall, target: { kind: "resolved", source: checkedCall, call: Object.freeze(selected) },
      sourceArgumentParameterTypes: Object.freeze(sourceArgumentParameterTypes) }];
  }));
  const evidence = { compileTimeMetadata: { get: () => false },
    typeParameterConstraints: { get: () => [] },
    contextualType: { get: node => {
      const outcome = source.facts.values.type(node);
      return outcome.kind === "refused" ? undefined : { selectedType: outcome.type, targetType: target };
    } },
    nodeTargetType: { get: node => source.syntax.is.IsArrowFunction(node) || source.syntax.is.IsFunctionExpression(node) ? callable : scalar },
    storageTargetType: { get: () => undefined } };
  const storage = { nativeBacking: { get: () => undefined },
    nativeArray: { get: () => undefined },
    storageType: { get: () => undefined },
    typedLocationIdentity: { get: () => false } };
  assert.equal(lambdas.length, 1, "one exact authored callable");
  const lambda = lambdas[0];
  const parameters = source.syntax.parameters(lambda);
  const contract = Object.freeze({ kind: "source", sourceDeclaration: lambda,
    nativeSignature: Object.freeze({ methodTypeParameterIdentities: [], methodAllowsRefLikeTypeArguments: [] }),
    parameters, nativeParameters: parameters.map(parameter => ({ sourceParameter: parameter,
      targetParameter: { name: source.syntax.text(source.syntax.name(parameter)), type: scalar, passingMode: "by-value" } })),
    returnType: scalar });
  const contracts = { get: identity => identity.declaration === lambda ? contract : undefined, closedInputType: () => undefined };
  const selectedOperations = { selectedCall: { get: node => operations.get(node) }, selectedConstruction: { get: () => undefined } };
  const selected = analyzeCsharpCaptureStorage(source, { knownShapes: () => [] }, storage, evidence,
    [], contracts, { get: () => false }, selectedOperations,
    createCsharpTypeParameterEnvironment(() => ({ kind: "resolved", constraints: [] })));
  assert.equal(selected.issues.length === 0, true, "closed capture storage");
  const creationResult = analyzeCsharpCallableCreations({ source, nodes, captures: selected,
    contracts,
    operations: selectedOperations,
    storage: { lambdaParameterType: { get: parameter => parameters.includes(parameter) ? scalar : undefined },
      storageType: { get: declaration => source.syntax.is.IsVariableDeclaration(declaration) ? callable : undefined } },
    expectedTypes: { requiredExpectedType: { get: () => [] } },
    evidence, conversions: { conversion: { get: (input, output) => targetTypeRefEquals(input, output) ? { kind: "identity" } : undefined } } });
  assert.equal(creationResult.kind, "resolved", "the original creation fixture has no quotation syntax refusal");
  const creations = creationResult.value;
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
  assert.throws(() => input.selected.callableCreation.get({}), error => error instanceof Error &&
    error.message === "Callable creation reads require their admitted source-node domain.");
  assert.throws(() => input.selected.callableTarget.get({}), error => error instanceof Error &&
    error.message === "Callable creation reads require their admitted source-node domain.");
  assert.equal(input.selected.callableCreation.get(input.nodes[0]) === undefined, true,
    "a known non-callable source node has no fabricated creation");
  assert.throws(() => analyzeCsharpNativeParticipation({ ast: input.source.syntax,
    storage: { nodes: input.nodes, failureReason: () => undefined }, facts: input.source.facts,
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

test("native callable creation publication distinguishes foreign, duplicate and sealed ownership", () => {
  const declaration = Object.freeze({});
  const foreign = Object.freeze({});
  const creation = Object.freeze({ kind: "pending" });
  const producer = createCsharpCallableCreationProducer([declaration]);
  assert.throws(() => producer.publish(foreign, creation), error => error instanceof Error &&
    error.message.includes("Native callable creation publication requires its admitted source-node domain."));
  producer.publish(declaration, creation);
  assert.throws(() => producer.publish(declaration, creation), error => error instanceof Error &&
    error.message.includes("A native callable creation publishes once for each admitted source node."));
  const selected = producer.seal();
  assert.equal(selected.callableCreation.get(declaration) === creation, true,
    "publication retains the identical frozen creation on its original declaration");
  assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected.callableCreation), true);
  assert.equal(selected.callableTarget.get(declaration), undefined, "pending is not a fabricated native carrier");
  assert.throws(() => producer.publish(foreign, creation), error => error instanceof Error &&
    error.message.includes("A native callable creation cannot publish after sealing."));
  assert.throws(() => producer.seal(), error => error instanceof Error &&
    error.message.includes("Native callable creations seal once."));
});
