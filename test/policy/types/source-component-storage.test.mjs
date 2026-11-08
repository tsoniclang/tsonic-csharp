import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { resolvedSourceValue } from "../../helpers/published-return-contracts.mjs";
import { getCsharpCallableMembers } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpSourcePrimitiveTargetType, csharpExceptionTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";

function fixture(text, surface = "native") {
  const compiled = analyzeCsharpSource({ surface, sourceText:
    'import type { int32, int64, uint64 } from "@tsonic/core/types.js";' + text });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(compiled.analysis.kind, "resolved");
  const source = compiled.source;
  const nodes = [];
  const visit = node => {
    nodes.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.sourceFiles) if (!source.ast.isDeclarationFile(file)) visit(file);
  const parameter = name => {
    const selected = nodes.filter(node => source.ast.is.IsParameterDeclaration(node) &&
      source.ast.text(source.ast.name(node)) === name);
    assert.equal(selected.length, 1, `one exact original parameter ${name}`);
    return selected[0];
  };
  return { compiled, source, nodes, parameter, program: compiled.analysis.value, view: source.facts.descriptors,
    representation: compiled.analysis.value.representation };
}

function definition(input, evidence) {
  return evidence.type.kind === "declared" || evidence.type.kind === "projection"
    ? resolvedSourceValue(input.view.definition(evidence), "the same original component definition") : evidence;
}

function slot(input, name) {
  const node = input.parameter(name);
  return { node, evidence: resolvedSourceValue(input.source.facts.values.declaredSlot(node), "the actual original slot").type };
}

function child(input, evidence, selector) {
  return resolvedSourceValue(input.view.component(evidence, selector), "the authenticated original child component");
}

function native(input, evidence, site, position = "storage") {
  const selected = input.representation.represent(evidence, position, site);
  assert.equal(selected.kind, "represented");
  assert.equal(selected.value.evidence === evidence, true, "Native representation keeps the exact original child");
  return selected.value.carrier;
}

test("implementation signature evidence retains the original contextual rest tuple before physical parameter expansion", () => {
  const input = fixture("export const consume: (...values: [int32, int64, string]) => boolean = (...values) => values[0] > 0;");
  const implementation = input.nodes.find(node => input.source.ast.is.IsArrowFunction(node));
  assert.equal(implementation !== undefined, true);
  const callable = definition(input, resolvedSourceValue(input.source.facts.values.type(implementation), "the original implementation"));
  assert.equal(callable.type.kind === "callable" || callable.type.kind === "shape", true);
  assert.equal(callable.type.calls.length, 1);
  const signature = callable.type.calls[0];
  assert.equal(signature.parameters.length, 1, "Source retains one authored rest parameter");
  assert.equal(signature.parameters[0].kind, "rest");
  const rest = child(input, callable, { kind: "parameter", signature: signature.identity, index: 0 });
  assert.equal(rest.type.kind, "tuple");
  assert.equal(rest.type.elements.length, 3);
  const members = getCsharpCallableMembers(native(input, callable, implementation));
  assert.equal(members.length, 1);
  assert.equal(members[0].signature.parameters.length, 3, "only the Native parameter-vector owner expands the physical tuple ABI");
  assert.equal(targetTypeRefEquals(members[0].signature.parameters[0], csharpSourcePrimitiveTargetType("int32")), true);
  assert.equal(targetTypeRefEquals(members[0].signature.parameters[1], csharpSourcePrimitiveTargetType("int64")), true);
  assert.equal(child(input, callable, { kind: "parameter", signature: signature.identity, index: 0 }) === rest, true);
});

test("nested type transformations retain their selected component independently of metadata declarations", () => {
  const input = fixture("export interface Packet { readonly pieces: readonly [int64, uint64][]; } " +
    "export declare function inspect(input: Packet): void;");
  const original = slot(input, "input");
  const record = definition(input, original.evidence);
  assert.equal(record.type.kind, "shape");
  const property = record.type.members[0];
  const array = child(input, record, { kind: "member", origin: property.origin });
  const tuple = child(input, array, { kind: "array-element" });
  const selected = child(input, tuple, { kind: "tuple-element", index: 1 });
  const path = selected.component.path;
  assert.equal(selected.type.kind, "primitive");
  assert.equal(selected.type.primitive, "uint64");
  assert.equal(targetTypeRefEquals(native(input, selected, original.node), csharpSourcePrimitiveTargetType("uint64")), true);
  assert.equal(child(input, tuple, { kind: "tuple-element", index: 1 }) === selected, true);
  assert.equal(selected.component.path === path && record.type.members[0].origin === property.origin, true);
  assert.equal(Object.isFrozen(selected.component) && Object.isFrozen(path), true);
});

test("callable inputs and nested tuple transformations keep their own actual entry storage", () => {
  const input = fixture("export function inspect(input: [int64, uint64]): uint64 { return input[1]; }");
  const original = slot(input, "input");
  const reference = input.source.facts.values.occurrences().find(node =>
    input.source.ast.is.IsIdentifier(node) && input.source.ast.text(node) === "input");
  assert.equal(reference !== undefined, true);
  const storage = resolvedSourceValue(input.source.facts.protocols.storage(reference), "the actual binding read");
  assert.equal(storage.kind, "present");
  assert.equal(storage.value.kind, "binding");
  assert.equal(storage.value.declaration === original.node, true);
  const element = child(input, original.evidence, { kind: "tuple-element", index: 1 });
  const whole = native(input, original.evidence, original.node);
  assert.equal(whole.kind, "tuple");
  assert.equal(targetTypeRefEquals(whole.elements[1], native(input, element, reference)), true);
  assert.equal(storage.value.storage === original.node, true, "an element transformation never replaces its binding owner");
});

test("recognized Error profiles retain exact published Native identity without a storage-history owner", () => {
  const input = fixture("export declare function inspect(input: Error): void;", "js");
  const original = slot(input, "input");
  assert.equal(native(input, original.evidence, original.node).id, "System.Exception");
  const published = input.program.analysis.policy.providers.publishNativeIdentities(csharpExceptionTargetType());
  assert.equal(published.kind, "resolved");
  assert.equal(published.value.id, "System.Exception");
  const missing = createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] })
    .publishNativeIdentities(csharpExceptionTargetType());
  assert.equal(missing.kind, "missing", "a missing Native binding never manufactures an Error carrier");
  const shadow = fixture("export interface Error { readonly custom: string; } export declare function inspect(input: Error): void;");
  const shadowSlot = slot(shadow, "input");
  assert.notEqual(native(shadow, shadowSlot.evidence, shadowSlot.node).id, "System.Exception",
    "a same-named project declaration is not the configured global Error identity");
});

test("callable results establish their own component rather than retaining the enclosing delegate input", () => {
  const input = fixture("export declare function inspect(input: (value: int64[]) => uint64): void;");
  const original = slot(input, "input");
  const callable = definition(input, original.evidence);
  const signature = callable.type.calls[0];
  const parameter = child(input, callable, { kind: "parameter", signature: signature.identity, index: 0 });
  const result = child(input, callable, { kind: "result", signature: signature.identity });
  const publication = resolvedSourceValue(input.source.facts.values.callableReturn(signature.identity), "the exact original callable return");
  assert.equal(result === publication, true);
  assert.equal(result.component === parameter.component, false);
  assert.equal(result.component.path.at(-1).kind, "result");
  assert.equal(parameter.component.path.at(-1).kind, "parameter");
  assert.equal(targetTypeRefEquals(native(input, result, original.node, "return"), csharpSourcePrimitiveTargetType("uint64")), true);
  assert.equal(child(input, callable, { kind: "result", signature: signature.identity }) === result, true);
});

test("declaration-free tuple projections retain canonical child evidence and reject copied ownership", () => {
  const input = fixture("export declare function inspect(input: readonly [int64, uint64]): void;");
  const original = slot(input, "input");
  const selected = child(input, original.evidence, { kind: "tuple-element", index: 1 });
  native(input, selected, original.node);
  assert.equal(child(input, original.evidence, { kind: "tuple-element", index: 1 }) === selected, true);
  assert.throws(() => input.representation.represent({ ...selected }, "storage", original.node), TypeError);
  assert.throws(() => input.view.component({ ...original.evidence }, { kind: "tuple-element", index: 1 }), TypeError,
    "a warm Native cache cannot authenticate a copied declaration-free projection");
});

test("each actual input member return and receiver role uses the same Source component owner", () => {
  const input = fixture("export interface Record { values: [int64, uint64][]; } " +
    "export declare function inspect(input: Record, receiver: (this: Record, value: [int64, uint64][]) => Record): void;");
  const original = slot(input, "input");
  const record = definition(input, original.evidence);
  const member = child(input, record, { kind: "member", origin: record.type.members[0].origin });
  const element = child(input, member, { kind: "array-element" });
  const leaf = child(input, element, { kind: "tuple-element", index: 1 });
  const callback = definition(input, slot(input, "receiver").evidence);
  const signature = callback.type.calls[0];
  const receiver = child(input, callback, { kind: "receiver", signature: signature.identity });
  const result = child(input, callback, { kind: "result", signature: signature.identity });
  for (const evidence of [original.evidence, member, element, leaf, receiver, result]) {
    input.view.assertEvidence(evidence);
    const component = evidence.component;
    native(input, evidence, original.node);
    assert.equal(evidence.component === component, true);
    assert.equal(Object.isFrozen(component.path), true);
  }
  assert.equal(receiver.component === result.component, false, "distinct Source roles never collapse by shared descriptor geometry");
});
