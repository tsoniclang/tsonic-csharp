import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpObjectShapeMemberResolver } from "../../../dist/analysis/objects/shapes/member-evidence.js";
import { createTargetSourceProgram, sourceTypeDescriptorMemberOriginsEqual, sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import { checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";

const carrier = Object.freeze({ kind: "source-primitive", name: "int64" });
const identicalNodes = (actual, expected) => actual?.length === expected.length &&
  actual.every((node, index) => node === expected[index]);
function fixture() {
  const checked = checkCsharpSource({ sourceText: `
import type { int64 } from "@tsonic/core/types.js";
interface Slot { count: int64; }
const source: Slot = { count: 1n };
const earlier: Slot = { count: 2n };
` });
  assert.equal(checked.sourceDiagnosticsText, "");
  const program = createTargetSourceProgram(checked.source);
  const declarations = new Map();
  const visit = node => {
    if (program.ast.is.IsVariableDeclaration(node)) declarations.set(program.ast.text(program.ast.name(node)), node);
    program.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  program.navigation.sourceFiles.forEach(visit);
  const literal = name => program.ast.as.AsVariableDeclaration(declarations.get(name)).Initializer;
  const occurrence = literal("source");
  const sourceDeclaration = program.ast.properties(occurrence)[0];
  const earlierDeclaration = program.ast.properties(literal("earlier"))[0];
  const base = program.effectiveTypes.get(occurrence);
  assert.equal(base !== undefined && base.kind !== "refused", true, "the identical construction has its Host publication");
  let publication = base;
  const actualQueries = program.semantics.forNode(occurrence);
  const queries = { ...actualQueries, types: new Proxy({}, { get() {
    return assert.fail("the canonical member contract cannot reopen structural checker correspondence");
  } }) };
  const resolver = createCsharpObjectShapeMemberResolver({ ast: program.ast, navigation: program.navigation,
    effectiveTypes: { get: node => node === occurrence ? publication : undefined },
    hasSemantics: file => program.semantics.includes(file), semantics: () => queries, semanticsFor: () => queries,
    sourceStorage: { memberSubjectFor: () => undefined }, memoryBindings: { hasBoundField: () => false },
    representations: { genericProjections: () => [] }, typeResolver: { resolveDescriptor: descriptor => {
      const selected = sourceTypeDescriptorStructure(descriptor);
      assert.equal(selected.kind === "primitive" && selected.primitive === "int64", true, "the actual published width");
      return carrier;
    } },
  });
  const descriptor = resolver.publishedShapeDescriptor(occurrence);
  const members = resolver.deriveMembers(descriptor, occurrence, queries, { depth: 0 });
  assert.equal(members?.length === 1, true, "the complete published member vector");
  const origin = sourceTypeDescriptorStructure(descriptor).members[0].origin;
  const select = (selected = members) => resolver.retainPublishedMembers(selected, descriptor, occurrence, queries, { depth: 0 });
  return { members, origin, sourceDeclaration, earlierDeclaration, select, publish: value => { publication = value; } };
}

test("structural receiver evidence uses exact checker correspondence without changing native storage", () => {
  const input = fixture();
  const selected = input.select();
  assert.equal(selected?.length, 1);
  assert.strictEqual(selected[0].type, carrier);
  assert.equal(identicalNodes(selected[0].sourceSubjects, [input.origin.declaration, input.sourceDeclaration]), true, "the exact ordered canonical subjects");
  assert.equal(identicalNodes(selected[0].sourceDeclarations, [input.sourceDeclaration]), true, "only the actual producer declaration");
  assert.equal(selected[0].origins.length === 1 && sourceTypeDescriptorMemberOriginsEqual(selected[0].origins[0], input.origin), true);
  assert.equal(selected[0].sourceTypes === undefined && selected[0].sourceMemberEvidence === undefined, true);
  assert.equal(Object.isFrozen(selected[0].sourceSubjects), true);
});

test("structural instance declarations retain only the exact selected producer occurrence", () => {
  const input = fixture();
  const selectedMember = { ...input.members[0], sourceSubjects: [input.origin.declaration, input.earlierDeclaration],
    sourceDeclarations: [input.earlierDeclaration] };
  const selected = input.select([selectedMember]);
  assert.equal(identicalNodes(selected[0].sourceDeclarations, [input.sourceDeclaration]), true, "only the current producer declaration");
  assert.equal(selected[0].sourceSubjects.includes(input.earlierDeclaration), true);
  assert.equal(identicalNodes(selectedMember.sourceDeclarations, [input.earlierDeclaration]), true, "the original input remains unchanged");
  assert.equal(Object.isFrozen(selected[0].sourceDeclarations), true);
});

test("structural receiver evidence rejects absent, ambiguous and unrelated destination identities", () => {
  const input = fixture();
  assert.equal(input.select([]) === undefined, true, "absent member");
  assert.equal(input.select([input.members[0], input.members[0]]) === undefined, true, "ambiguous member");
  assert.equal(input.select([{ ...input.members[0], origins: [{ kind: "declared", declaration: input.earlierDeclaration }] }]) === undefined,
    true, "unrelated destination");
  input.publish(undefined);
  assert.equal(input.select() === undefined, true, "unavailable correspondence");
});
