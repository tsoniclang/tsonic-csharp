import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { resolvedSourceValue } from "../../helpers/published-return-contracts.mjs";
import { selectCsharpHostLiteralCorrespondence } from "../../../dist/analysis/objects/shapes/host-correspondence.js";
import { sourceMemberOriginsEqual } from "../../../dist/analysis/objects/shapes/member-origins.js";

function fixture() {
  const compiled = analyzeCsharpSource({ sourceText: `
    import type { int64 } from "@tsonic/core/types.js";
    interface Slot { count: int64; }
    export const current: Slot = { count: 1n };
    export const previous: Slot = { count: 2n };
  ` });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(compiled.analysis.kind, "resolved", "the genuine Native program owns its same Source view");
  const program = compiled.analysis.value;
  const source = compiled.source;
  const declarations = new Map();
  const visit = node => {
    if (source.ast.is.IsVariableDeclaration(node)) declarations.set(source.ast.text(source.ast.name(node)), node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.sourceFiles) if (!source.ast.isDeclarationFile(file)) visit(file);
  const current = source.ast.as.AsVariableDeclaration(declarations.get("current")).Initializer;
  const previous = source.ast.as.AsVariableDeclaration(declarations.get("previous")).Initializer;
  const construction = resolvedSourceValue(source.facts.values.construction(current), "original construction").value;
  const destination = resolvedSourceValue(source.facts.values.declaredSlot(declarations.get("current")), "original Slot destination").type;
  const represent = evidence => {
    const result = program.representation.represent(evidence, "storage", current);
    assert.equal(result.kind, "represented");
    const shape = program.analysis.typeSystem.objectShapes.resolveTarget(result.value.carrier);
    assert.equal(shape !== undefined, true, "the actual completed Native shape");
    return shape;
  };
  const sourceShape = represent(construction.value);
  const destinationShape = represent(destination);
  const select = (selected = sourceShape, evidence = construction.value) => selectCsharpHostLiteralCorrespondence(
    source.facts.descriptors, source.facts.objects, evidence, destination, selected, destinationShape, current);
  return { source, current, previous, construction, destination, sourceShape, destinationShape, select };
}

test("structural correspondence preserves exact current original Source pairs and Native width", () => {
  const input = fixture();
  const result = input.select();
  assert.equal(result.kind, "represented");
  assert.equal(result.value.length, 1);
  const pair = result.value[0];
  assert.equal(pair.source.type.name, "int64");
  assert.equal(pair.destination.type.name, "int64");
  const current = input.source.ast.properties(input.current)[0];
  assert.equal(pair.original.source.declarations.includes(current), true, "the current authored producer declaration");
  assert.equal(pair.source.origins.every(origin => pair.original.source.origins.some(original =>
    sourceMemberOriginsEqual(origin, original))), true, "all original source identities, not a name join");
  assert.equal(pair.source.sourceTypes === undefined && pair.source.sourceMemberEvidence === undefined, true,
    "no raw checker or retired evidence transport");
});

test("a previous physical subject cannot replace the current Source producer declaration", () => {
  const input = fixture();
  const current = input.source.ast.properties(input.current)[0];
  const previous = input.source.ast.properties(input.previous)[0];
  const selected = { ...input.sourceShape, members: input.sourceShape.members.map(member => ({
    ...member, sourceSubjects: [...member.sourceSubjects, previous], sourceDeclarations: [previous],
  })) };
  const result = input.select(selected);
  assert.equal(result.kind, "represented");
  assert.equal(result.value[0].original.source.declarations.includes(current), true);
  assert.equal(result.value[0].original.source.declarations.includes(previous), false,
    "the actual Source pair, not retained Native subject history, owns construction declarations");
  assert.equal(selected.members[0].sourceDeclarations[0] === previous, true, "input Native metadata is not rewritten");
});

test("structural correspondence rejects absent, ambiguous, foreign origins and counterfeit Source evidence", () => {
  const input = fixture();
  const member = input.sourceShape.members[0];
  const previous = input.source.ast.properties(input.previous)[0];
  for (const members of [[], [member, member], [{ ...member, origins: [{ kind: "declared", declaration: previous }] }]]) {
    const result = input.select({ ...input.sourceShape, members });
    assert.equal(result.kind, "native-refused");
    assert.equal(result.code, "CSHARP_NATIVE_MEMBER_ORIGIN_MISSING");
    assert.equal(result.site === input.current, true);
  }
  assert.throws(() => input.select(input.sourceShape, { ...input.construction.value }), TypeError,
    "a foreign publication cannot borrow a cached same-view correspondence");
});
