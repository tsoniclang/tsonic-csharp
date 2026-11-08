import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { resolvedSourceValue } from "../../helpers/published-return-contracts.mjs";
import { createCsharpObjectShapeValueStorage } from "../../../dist/policy/types/objects/shape-carriers.js";
import { csharpObjectShapeMemberContractKey } from "../../../dist/target-model/types/object-shape-identity.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import { createNativeConversionHost } from "../../helpers/native-conversion-host.mjs";

function fixture() {
  const compiled = analyzeCsharpSource({ sourceText: `
    export function takeNumber(value: number): void {}
    export function run(): void {
      const selected = { chosen: 1, unchanged: 2 };
      const earlier = { chosen: 3, unchanged: 4 };
      takeNumber(selected.chosen); void selected.unchanged;
      takeNumber(earlier.chosen); void earlier;
    }
  ` });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(compiled.analysis.kind, "resolved");
  const program = compiled.analysis.value;
  const source = compiled.source;
  const nodes = [];
  const visit = node => {
    nodes.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.sourceFiles) if (!source.ast.isDeclarationFile(file)) visit(file);
  const named = (node, name) => source.ast.text(source.ast.name(node)) === name;
  const declaration = nodes.find(node => source.ast.is.IsVariableDeclaration(node) && named(node, "selected"));
  const earlier = nodes.find(node => source.ast.is.IsVariableDeclaration(node) && named(node, "earlier"));
  const literal = source.ast.as.AsVariableDeclaration(declaration).Initializer;
  const reference = source.facts.values.occurrences().find(node => source.ast.is.IsIdentifier(node) &&
    source.ast.text(node) === "selected" && source.ast.is.IsPropertyAccessExpression(source.ast.parent(node)));
  const evidence = resolvedSourceValue(source.facts.values.type(reference), "the exact current read");
  const original = program.representation.represent(evidence, "storage", reference);
  assert.equal(original.kind, "represented");
  const registry = program.analysis.typeSystem.objectShapes;
  const logical = registry.resolveTarget(original.value.carrier);
  assert.equal(logical !== undefined, true, "the actual logical Native shape inventory");
  const physical = createCsharpObjectShapeValueStorage(logical);
  assert.equal(physical !== undefined, true, "the Native scalar-field layout has an idiomatic value-storage form");
  const retained = registry.retainShape(physical, literal);
  assert.equal(retained.kind, "represented");
  return { compiled, program, source, nodes, declaration, earlier, literal, reference, evidence,
    registry, logical, physical: retained.value };
}

for (const site of ["declaration", "literal", "reference"]) {
  test(`physical ${site} receiving keeps exact registered members and unchanged original Source evidence`, () => {
    const input = fixture();
    const evidence = site === "declaration"
      ? resolvedSourceValue(input.source.facts.values.declaredSlot(input.declaration), "original storage").type
      : resolvedSourceValue(input.source.facts.values.type(input[site]), "original occurrence");
    const selected = input.registry.resolveEvidence(evidence, input.physical.targetType, input[site]);
    assert.equal(selected.kind, "represented");
    assert.equal(selected.value.kind, "present");
    assert.equal(targetTypeRefEquals(selected.value.value.targetType, input.physical.targetType), true);
    assert.equal(selected.value.value.members.every((member, index) =>
      csharpObjectShapeMemberContractKey(member) === csharpObjectShapeMemberContractKey(input.physical.members[index])), true);
    assert.equal(evidence === (site === "declaration"
      ? resolvedSourceValue(input.source.facts.values.declaredSlot(input.declaration), "same storage").type
      : resolvedSourceValue(input.source.facts.values.type(input[site]), "same occurrence")), true,
      "physical receiving never copies, widens or re-publishes Source");
  });
}

for (const declarationKind of ["class", "interface", "struct"]) {
  test(`an anonymous physical shape cannot replace an actual selected Native ${declarationKind}`, () => {
    const input = fixture();
    const carrier = csharpTargetNamedType(`fixture.${declarationKind}`, [],
      { kind: "named", name: "Selected" }, { sourceDeclarationKind: declarationKind,
        allowsRefLikeTypeArguments: [], ...(declarationKind === "struct" ? { valueType: true } : {}) });
    const retained = input.registry.retainShape({ ...input.physical, targetType: carrier }, input.reference);
    assert.equal(retained.kind, "represented");
    assert.equal(targetTypeRefEquals(retained.value.targetType, carrier), true);
    assert.equal(selectCsharpConversion(createNativeConversionHost({
      shapes: [{ carrier, shape: retained.value }, { carrier: input.physical.targetType, shape: input.physical }],
    }), carrier, input.physical.targetType, "implicit").kind, "rejected",
    "same member geometry never replaces a Native declaration identity or authorizes a value copy");
  });
}

test("an unregistered physical identity is none rather than a logical-carrier fallback", () => {
  const input = fixture();
  const carrier = { ...input.physical.targetType, id: "fixture.unregistered",
    csharpRender: { kind: "named", name: "Unregistered" } };
  const result = input.registry.resolveEvidence(input.evidence, carrier, input.reference);
  assert.equal(result.kind, "represented");
  assert.equal(result.value.kind, "none", "no registry proof does not become a different successful Source representation");
  assert.equal(input.program.representation.represent(input.evidence, "storage", input.reference).value.carrier === input.logical.targetType, true,
    "logical publication remains independently canonical");
});

for (const kind of ["missing-origins", "foreign-same-width-origin", "ambiguous-origins"]) {
  test(`physical shape receiving refuses ${kind} without mutating Source`, () => {
    const input = fixture();
    const foreign = input.source.ast.properties(input.source.ast.as.AsVariableDeclaration(input.earlier).Initializer)[0];
    const member = input.physical.members[0];
    const changed = kind === "missing-origins" ? { ...member, origins: [] }
      : kind === "foreign-same-width-origin" ? { ...member, origins: [{ kind: "declared", declaration: foreign }] } : member;
    const carrier = { ...input.physical.targetType, id: `fixture.${kind}`,
      csharpRender: { kind: "named", name: "Changed" } };
    const members = kind === "ambiguous-origins" ? [member, member, ...input.physical.members.slice(1)]
      : [changed, ...input.physical.members.slice(1)];
    const retained = input.registry.retainShape({ ...input.physical, targetType: carrier, members }, input.reference);
    assert.equal(retained.kind, "represented");
    const selected = input.registry.resolveEvidence(input.evidence, carrier, input.reference);
    assert.equal(selected.kind, "native-refused");
    assert.equal(selected.code, "CSHARP_NATIVE_MEMBER_ORIGIN_MISSING");
    assert.equal(selected.site === input.reference, true);
  });
}

for (const kind of ["different-width", "different-readonly", "different-presence"]) {
  test(`a cached physical header rejects ${kind} under its existing exact Native identity`, () => {
    const input = fixture();
    const member = input.physical.members[0];
    const changed = kind === "different-width" ? { ...member, type: { kind: "source-primitive", name: "bool" } }
      : kind === "different-readonly" ? { ...member, readonly: member.readonly !== true }
      : { ...member, optional: member.optional !== true };
    assert.throws(() => input.registry.retainShape({ ...input.physical,
      members: [changed, ...input.physical.members.slice(1)] }, input.reference), TypeError);
    assert.equal(input.registry.resolveTarget(input.physical.targetType) === input.physical, true,
      "transactional refusal cannot replace the original registered Native layout");
  });
}

for (const kind of ["foreign-program", "copied-publication", "foreign-component"]) {
  test(`physical receiving rejects ${kind} before a cached layout can authorize it`, () => {
    const input = fixture();
    const foreign = kind === "foreign-program" ? fixture().evidence
      : kind === "foreign-component" ? { ...input.evidence, component: { ...input.evidence.component, root: input.earlier } }
      : { ...input.evidence };
    assert.throws(() => input.registry.resolveEvidence(foreign, input.physical.targetType, input.reference), TypeError);
  });
}

test("the complete original construction receipt remains independent of solver-group identity", () => {
  const input = fixture();
  const construction = resolvedSourceValue(input.source.facts.values.construction(input.literal), "original construction");
  assert.equal(construction.kind, "present");
  assert.equal(construction.value.occurrence === input.literal, true);
  assert.equal(construction.value.value === resolvedSourceValue(input.source.facts.values.type(input.literal), "same literal"), true);
  const retained = input.registry.retainConstructionSource(input.literal, input.physical);
  assert.equal(retained.kind, "represented");
  assert.equal(targetTypeRefEquals(retained.value.targetType, input.physical.targetType), true);
  assert.equal("provenance" in construction.value.value, false, "there is no naked principal/solver-group authorization seam");
  assert.equal(targetTypeRefKey(retained.value.targetType), targetTypeRefKey(input.physical.targetType));
});
