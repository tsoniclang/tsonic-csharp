import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { resolvedSourceValue } from "../../helpers/published-return-contracts.mjs";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

function fixture(alias = "export type View<Value> = { readonly [Key in keyof Value]: Value[Key] }", use = "View<Box>") {
  const compiled = analyzeCsharpSource({
    sourceText: `import type { Box, View } from "./records.js"; export declare function use(value: ${use}): void;`,
    files: { "records.ts": `import type { int64 } from "@tsonic/core/types.js";
      export interface Box { value: int64; label: string; } ${alias}` },
  });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(compiled.analysis.kind, "resolved");
  const source = compiled.source;
  const file = source.sourceFiles.find(file => source.ast.getFileName(file).endsWith("/index.ts"));
  const declarationFile = source.sourceFiles.find(file => source.ast.getFileName(file).endsWith("/records.ts"));
  const declaration = source.ast.statements(file).find(node => source.ast.is.IsFunctionDeclaration(node));
  const parameter = source.ast.parameters(declaration)[0];
  const aliasDeclaration = source.ast.statements(declarationFile).find(node => source.ast.is.IsTypeAliasDeclaration(node) &&
    source.ast.text(source.ast.name(node)) === "View");
  const evidence = resolvedSourceValue(source.facts.values.declaredSlot(parameter), "the original imported-alias parameter").type;
  const view = source.facts.descriptors;
  const represent = value => {
    const selected = compiled.analysis.value.representation.represent(value, "storage", parameter);
    assert.equal(selected.kind, "represented");
    assert.equal(selected.value.evidence === value, true);
    return selected.value;
  };
  return { compiled, source, file, declarationFile, parameter, aliasDeclaration, evidence, view, represent,
    program: compiled.analysis.value };
}

function definition(input, evidence) {
  const visited = new Set();
  while (evidence.type.kind === "declared" || evidence.type.kind === "projection") {
    assert.equal(visited.has(evidence), false, "a closed Source alias has one completed definition, not a Native syntax retry");
    visited.add(evidence);
    evidence = resolvedSourceValue(input.view.definition(evidence), "the exact original alias definition");
  }
  return evidence;
}

test("cross-file transformed aliases retain original Source bindings and exact Native field contracts", () => {
  const input = fixture();
  const originalArguments = input.view.freeParameters(input.evidence);
  assert.equal(originalArguments.length, 0);
  const selected = definition(input, input.evidence);
  assert.equal(selected.type.kind, "shape");
  const represented = input.represent(input.evidence);
  const shape = input.program.analysis.typeSystem.objectShapes.resolveTarget(represented.carrier);
  assert.equal(shape !== undefined, true);
  assert.deepEqual(shape.members.map(member => member.sourceName), ["label", "value"]);
  for (const member of shape.members) {
    assert.equal(member.readonly, true);
    const source = selected.type.members.find(candidate => candidate.origin === member.origins[0]);
    assert.equal(source !== undefined, true, "the mapped slot keeps its actual original Source origin");
    assert.equal(member.origins[0].kind, "mapped");
    assert.equal(input.source.ast.getSourceFile(member.origins[0].owner) === input.declarationFile, true);
    assert.equal(targetTypeRefEquals(member.type, member.sourceName === "value"
      ? csharpSourcePrimitiveTargetType("int64") : csharpStringTargetType()), true);
  }
  assert.equal(input.represent(input.evidence) === represented, true, "one canonical Native result, no declaration-checker retry");
  assert.equal(input.view.freeParameters(input.evidence) === originalArguments, true);
});

test("compositional cross-file aliases retain their declaration owner and exact parameter order", () => {
  const input = fixture("export type View<First, Second> = [First, Second]", "View<Box, string>");
  const parameters = input.source.ast.typeParameters(input.aliasDeclaration);
  assert.equal(parameters.length, 2);
  assert.deepEqual(parameters.map(node => input.source.ast.text(input.source.ast.name(node))), ["First", "Second"]);
  const selected = definition(input, input.evidence);
  assert.equal(selected.type.kind, "tuple");
  const first = resolvedSourceValue(input.view.component(selected, { kind: "tuple-element", index: 0 }), "the first original argument");
  const second = resolvedSourceValue(input.view.component(selected, { kind: "tuple-element", index: 1 }), "the second original argument");
  const carrier = input.represent(input.evidence).carrier;
  assert.equal(carrier.kind, "tuple");
  assert.equal(carrier.elements.length, 2);
  assert.equal(targetTypeRefEquals(carrier.elements[0], input.represent(first).carrier), true);
  assert.equal(targetTypeRefEquals(carrier.elements[1], input.represent(second).carrier), true);
  assert.equal(targetTypeRefEquals(carrier.elements[1], csharpStringTargetType()), true);
  assert.equal(first.component === second.component, false);
  assert.equal(input.source.ast.getSourceFile(input.aliasDeclaration) === input.declarationFile, true);
  assert.equal(input.source.ast.getSourceFile(input.parameter) === input.file, true);
});

test("alias substitution rejects missing evidence and duplicate original declaration identities before Native receiving", () => {
  const input = fixture();
  const parameter = input.source.ast.typeParameters(input.aliasDeclaration)[0];
  const replacement = definition(input, input.evidence);
  assert.throws(() => input.view.substitute(input.evidence, [
    { declaration: parameter, value: replacement }, { declaration: parameter, value: replacement },
  ]), { message: "A Source application must bind each original parameter exactly once." });
  assert.throws(() => input.view.substitute(input.evidence, [{ declaration: parameter, value: undefined }]), TypeError);
  assert.throws(() => input.program.representation.represent(undefined, "storage", input.parameter), TypeError);
  assert.equal(input.view.freeParameters(input.evidence).length, 0,
    "failed applications cannot mutate the original complete caller environment");
});

test("unavailable or foreign transformed evidence cannot invent a selected Native carrier after a warm cache", () => {
  const input = fixture();
  const represented = input.represent(input.evidence);
  const foreign = fixture();
  for (const evidence of [foreign.evidence, { ...input.evidence },
    { ...input.evidence, component: foreign.evidence.component }]) {
    assert.throws(() => input.program.representation.represent(evidence, "storage", input.parameter), TypeError);
  }
  assert.equal(input.represent(input.evidence) === represented, true);
  assert.equal(Object.hasOwn(input.source, "semantics"), false);
  assert.equal(Object.hasOwn(input.source, "effectiveTypes"), false);
});
