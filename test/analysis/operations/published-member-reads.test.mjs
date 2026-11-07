import assert from "node:assert/strict";
import test from "node:test";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import { createTargetSourceProgram, sourceTypeDescriptorMemberOriginsEqual, sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import { resolveCsharpObjectShapeMemberReadTargetType } from "../../../dist/analysis/operations/members/object-shape-members.js";
import { csharpStringTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, checkCsharpSource, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { csharpProgramObjectLiteralShapes } from "../../helpers/program-source-files.mjs";
import { createTsonicPlugin as nodejsCapability } from "../../../../csharp-nodejs/dist/index.js";

const checked = checkCsharpSource({ sourceText: `
  import type { int32 } from "@tsonic/core/types.js";
  interface Current { value: int32; }
  interface Foreign { value: int32; other?: boolean; }
  interface Reference { checked: unknown; }
  interface Optional { readonly value?: int32; }
  interface First { value: string; }
  interface Second { value: string; extra: boolean; }
  export function current(value: Current): int32 { return value.value; }
  export function foreign(value: Foreign): int32 { return value.value; }
  export function reference(value: Reference): unknown {
    if (typeof value.checked === "string") return value.checked;
    return value.checked;
  }
  export function optional(value: Optional | undefined): int32 | undefined { return value?.value; }
  export function union(value: First | Second): string { return value.value; }
` });
assertCsharpCheckingSucceeded(checked);
const source = createTargetSourceProgram(checked.source);
const integer = csharpSourcePrimitiveTargetType("int32");

function selectionFor(owner) {
  const accesses = source.navigation.nodes.filter(node => {
    if (!source.ast.is.IsPropertyAccessExpression(node)) return false;
    let parent = source.ast.parent(node);
    while (parent !== undefined && !source.ast.is.IsFunctionDeclaration(parent)) parent = source.ast.parent(parent);
    return parent !== undefined && source.ast.text(source.ast.name(parent)) === owner;
  });
  const expression = owner === "reference" ? accesses[1] : accesses[0];
  const queries = source.semantics.forNode(expression);
  const access = queries.operations.propertyAccess(expression);
  assert.equal(access !== undefined, true, "the actual checked access is retained");
  return { receiver: access.receiver.expression,
    publication: source.effectiveTypes.get(access.receiver.expression),
    selectedDeclaration: access.selectedDeclaration,
    selectedSubjects: queries.facts.selectedSubjects(access.selectedSymbol, access.selectedDeclaration) };
}

function publishedMembers(selection) {
  const publication = selection.publication;
  assert.equal(publication !== undefined && publication.kind !== "refused", true, "the actual receiver has a completed publication");
  const visit = descriptor => {
    const structure = sourceTypeDescriptorStructure(descriptor);
    if (structure.kind === "optional") return visit(structure.value);
    if (structure.kind === "union") return structure.types.flatMap(visit);
    assert.equal(structure.kind === "shape", true, "the actual published member inventory is finite");
    return structure.members.filter(member => member.origin.kind === "declared" &&
      selection.selectedSubjects.includes(member.origin.declaration));
  };
  return visit(publication.type);
}

function nativeMember(selection, type = integer) {
  const members = publishedMembers(selection);
  return { sourceKey: { kind: "property", name: "value" }, sourceName: "value", targetName: "nativeValue",
    memberKind: "property", type, origins: members.map(member => member.origin) };
}

test("canonical member reads keep the exact selected declaration and reject old raw-Type authority", () => {
  const selection = selectionFor("current");
  const member = nativeMember(selection);
  Object.defineProperty(member, "sourceTypes", { get: () => assert.fail("canonical member reads never retry a checked Type relationship") });
  assert.equal(resolveCsharpObjectShapeMemberReadTargetType(member, selection) === integer, true);
  assert.equal(resolveCsharpObjectShapeMemberReadTargetType(member, {}) === undefined, true, "the deleted raw-Type form is not an authority");
});

test("missing publication, selected subjects or Native origins cannot authorize a member read", () => {
  const selection = selectionFor("current");
  const member = nativeMember(selection);
  for (const changed of [{ ...selection, publication: undefined }, { ...selection, selectedSubjects: [] }]) {
    assert.equal(resolveCsharpObjectShapeMemberReadTargetType(member, changed) === undefined, true);
  }
  assert.equal(resolveCsharpObjectShapeMemberReadTargetType({ ...member, origins: undefined }, selection) === undefined, true);
  assert.equal(resolveCsharpObjectShapeMemberReadTargetType({ ...member, origins: [] }, selection) === undefined, true);
});

test("a foreign occurrence or selected declaration cannot borrow a completed receiver publication", () => {
  const selection = selectionFor("current");
  const foreign = selectionFor("foreign");
  const member = nativeMember(selection);
  assert.equal(resolveCsharpObjectShapeMemberReadTargetType(member, { ...selection, receiver: foreign.receiver }) === undefined, true);
  assert.equal(resolveCsharpObjectShapeMemberReadTargetType(member, { ...selection, selectedDeclaration: foreign.selectedDeclaration }) === undefined, true);
});

test("same-width foreign origins do not acquire authority from names, storage or the expected target", () => {
  const selection = selectionFor("current");
  const foreign = selectionFor("foreign");
  const member = nativeMember(foreign);
  assert.equal(member.type === integer, true, "the opposite has the identical Native storage object");
  assert.equal(resolveCsharpObjectShapeMemberReadTargetType(member, selection, integer) === undefined, true);
});

test("an already-proven physical member can retain both canonical owners without selecting by name", () => {
  const selection = selectionFor("current");
  const foreign = selectionFor("foreign");
  const member = { ...nativeMember(selection), origins: [...nativeMember(selection).origins, ...nativeMember(foreign).origins] };
  assert.equal(resolveCsharpObjectShapeMemberReadTargetType(member, selection) === integer, true);
  assert.equal(resolveCsharpObjectShapeMemberReadTargetType(member, foreign) === integer, true);
});

test("a canonical union read requires every current arm's exact selected member origin", () => {
  const selection = selectionFor("union");
  const member = nativeMember(selection, csharpStringTargetType());
  assert.equal(member.origins.length === 2, true, "both actual declaration origins remain distinct");
  assert.equal(resolveCsharpObjectShapeMemberReadTargetType(member, selection) === member.type, true);
  assert.equal(resolveCsharpObjectShapeMemberReadTargetType({ ...member, origins: member.origins.slice(0, 1) }, selection) === undefined, true);
});

test("canonical optional member reads preserve their exact readonly absence-capable Native storage", () => {
  const selection = selectionFor("optional");
  const storage = csharpNullableTargetType(integer);
  const member = { ...nativeMember(selection, storage), optional: true, readonly: true };
  assert.equal(resolveCsharpObjectShapeMemberReadTargetType(member, selection, integer) === storage, true);
});

test("canonical opaque member reads retain the existing reference policy without inventing numeric storage", () => {
  const selection = selectionFor("reference");
  const storage = csharpTsValueTargetType();
  const string = csharpStringTargetType();
  const member = nativeMember(selection, storage);
  assert.equal(resolveCsharpObjectShapeMemberReadTargetType(member, selection, string) === string, true);
  assert.equal(resolveCsharpObjectShapeMemberReadTargetType(member, selection) === storage, true);
  assert.equal(resolveCsharpObjectShapeMemberReadTargetType(member, selection, integer) === storage, true);
});

test("both real provider fields retain their actual published origins and completed Native storage", () => {
  const compiled = compileCsharpSource({ capabilities: [nodejsCapability()], sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    import type { MakeDirectoryOptions } from "node:fs";
    export function make(): MakeDirectoryOptions { return {}; }
    export function mode(options: MakeDirectoryOptions): int32 | undefined { return options.mode; }
    export function recursive(options: MakeDirectoryOptions): boolean | undefined { return options.recursive; }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  const actual = program.source;
  const shapes = csharpProgramObjectLiteralShapes(program);
  assert.equal(shapes.length === 1 && shapes[0].members.length === 2, true, "one exact provider allocation retains both fields");
  const accesses = actual.navigation.nodes.filter(node => actual.ast.is.IsPropertyAccessExpression(node));
  assert.equal(accesses.length === 2, true, "both actual field reads stay in this complete inventory");
  for (const node of accesses) {
    const queries = actual.semantics.forNode(node);
    const access = queries.operations.propertyAccess(node);
    const publication = actual.effectiveTypes.get(access.receiver.expression);
    assert.equal(publication !== undefined && publication.kind !== "refused", true);
    const structure = sourceTypeDescriptorStructure(publication.type);
    assert.equal(structure.kind === "shape", true);
    const subjects = queries.facts.selectedSubjects(access.selectedSymbol, access.selectedDeclaration);
    const published = structure.members.filter(member => member.origin.kind === "declared" && subjects.includes(member.origin.declaration));
    assert.equal(published.length === 1 && published[0].origin.kind === "declared" &&
      actual.sourceFacts.getFact(published[0].origin.declaration, providerVirtualDeclarationFactKey) !== undefined, true);
    const members = shapes[0].members.filter(member => member.origins?.some(origin =>
      sourceTypeDescriptorMemberOriginsEqual(origin, published[0].origin)) === true);
    assert.equal(members.length === 1 && members[0].optional === true, true);
    const selection = { receiver: access.receiver.expression, publication,
      selectedDeclaration: access.selectedDeclaration, selectedSubjects: subjects };
    assert.equal(resolveCsharpObjectShapeMemberReadTargetType(members[0], selection) === members[0].type, true);
    assert.equal(resolveCsharpObjectShapeMemberReadTargetType({ ...members[0], origins: [] }, selection) === undefined, true);
  }
});
