import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpObjectShapeMemberResolver } from "../../../dist/analysis/objects/shapes/member-evidence.js";
import { createTargetSourceProgram, sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import { checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { resolveCsharpCallableTypeParameters } from "../../../dist/analysis/source-evidence/types/resolution/callable-type-parameters.js";
import { csharpSourceTypeParameter } from "../../../dist/source/extension/type-parameters.js";
import { csharpOptionalStorageProjection, getCsharpGenericOptionalParts } from "../../../dist/target-model/types/projections.js";

function scenario(rejectedIndex, count = 3) {
  const checked = checkCsharpSource({ sourceText: `import type { int64 } from "@tsonic/core/types.js";
    export interface Fields { ${Array.from({ length: count }, (_, index) =>
      `${index === 2 ? "readonly " : ""}field${index}${index === 1 ? "?" : ""}: int64;`).join(" ")} }` });
  assert.equal(checked.sourceDiagnosticsText, "", "the member inventory comes from valid checked Source");
  const source = createTargetSourceProgram(checked.source);
  const file = checked.source.getSourceFile("/project/index.ts");
  let owner;
  source.ast.forEachChild(file, node => { if (source.ast.is.IsInterfaceDeclaration(node)) owner = node; });
  assert.equal(owner !== undefined, true, "the actual declared owner is present");
  const outcome = source.effectiveTypes.get(owner);
  assert.equal(outcome?.kind === "resolved", true, "the exact owner has a published descriptor");
  const descriptor = outcome.type;
  const structure = sourceTypeDescriptorStructure(descriptor);
  assert.equal(structure.kind === "shape", true, "the published owner has a closed member inventory");
  const properties = structure.members;
  const carriers = Array.from({ length: count }, () => ({ kind: "source-primitive", name: "int64" }));
  const selected = [];
  const resolver = createCsharpObjectShapeMemberResolver({
    representations: { genericProjections: () => [] },
    ast: source.ast,
    navigation: source.navigation,
    hasSemantics: source.semantics.includes,
    semantics: source.semantics.forFile,
    semanticsFor: source.semantics.forNode,
    sourceStorage: { memberSubjectFor: () => undefined },
    typeResolver: { resolveDescriptor(type, occurrence) {
      assert.equal(occurrence === owner, true, "member representation keeps the exact published owner");
      const index = selected.length;
      assert.equal(type === properties[index].type, true, "the next published Source member is represented in order");
      selected.push(index);
      return index === rejectedIndex ? undefined : carriers[index];
    }, resolveType: () => assert.fail("published member collection must not reselect a raw checker Type") },
    memoryBindings: { hasBoundField: () => false },
  });
  const queries = source.semantics.forNode(owner);
  return { resolver, queries, selected, carriers, owner, descriptor, properties };
}

test("structural members stop at the first unavailable carrier without publishing a partial shape", () => {
  for (const rejectedIndex of [0, 1, 2]) {
    const { resolver, queries, selected, owner, descriptor } = scenario(rejectedIndex);
    assert.equal(resolver.deriveMembers(descriptor, owner, queries, { depth: 0 }) === undefined, true, `rejected field${rejectedIndex}`);
    assert.deepEqual(selected, Array.from({ length: rejectedIndex + 1 }, (_, index) => index));
  }
});

test("structural member rejection does no later resolver work even for a wide record", () => {
  const { resolver, queries, selected, owner, descriptor } = scenario(0, 256);
  assert.equal(resolver.deriveMembers(descriptor, owner, queries, { depth: 0 }) === undefined, true, "the exact unavailable record stays unavailable");
  assert.deepEqual(selected, [0]);
});

test("complete structural records preserve member order, native carriers and optional/readonly evidence", () => {
  const { resolver, queries, selected, carriers, owner, descriptor, properties } = scenario(-1);
  const members = resolver.deriveMembers(descriptor, owner, queries, { depth: 0 });
  assert.equal(members?.length === 3, true, "complete closed member collection");
  assert.deepEqual(selected, [0, 1, 2]);
  assert.deepEqual(members.map(member => member.sourceName), ["field0", "field1", "field2"]);
  assert.equal(members[0].type === carriers[0] && members[2].type === carriers[2], true, "exact native carrier identities");
  assert.equal(members[1].optional, true);
  assert.equal(members[2].readonly, true);
  assert.deepEqual(members.map(member => member.origins[0]), properties.map(property => property.origin));
  assert.equal(members.every((member, index) => member.origins[0] === properties[index].origin &&
    member.sourceDeclarations.includes(properties[index].origin.declaration)), true,
    "each native member retains its identical published Source origin and actual declaration");
});

function nativeBinderFixture() {
  const checked = checkCsharpSource({ sourceText: "interface View { read<T>(value: T | undefined): T; }" });
  assert.equal(checked.sourceDiagnosticsText, "", "the full native binder witness is checked source");
  const source = createTargetSourceProgram(checked.source);
  let declaration;
  const visit = node => {
    if (source.ast.is.IsMethodSignatureDeclaration(node)) declaration = node;
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  const file = checked.source.getSourceFile("/project/index.ts");
  assert.equal(file !== undefined, true, "the real checked source file is present");
  visit(file);
  assert.equal(declaration !== undefined, true, "the exact authored method signature is retained");
  const parameterDeclaration = source.ast.typeParameters(declaration)[0];
  const parameter = csharpSourceTypeParameter(parameterDeclaration, source.ast);
  assert.equal(parameter !== undefined, true, "the real authored binder has checked identity");
  const storage = csharpOptionalStorageProjection(parameter);
  const operations = getCsharpGenericOptionalParts(storage).operations;
  const projections = Object.freeze([operations, storage]);
  const host = { ast: source.ast, types: { resolveNode: () => assert.fail("the unconstrained binder has no source constraint query") },
    genericProjections(owner) { assert.equal(owner === declaration, true, "the canonical projection reader uses the selected method identity"); return projections; } };
  return { declaration, parameterDeclaration, parameter, sourceFile: source.ast.getSourceFile(declaration), projections, host };
}

test("native method binders contain the authored and complete canonical projection vector exactly once", () => {
  const fixture = nativeBinderFixture();
  const selected = resolveCsharpCallableTypeParameters(fixture.declaration, fixture.sourceFile, fixture.host);
  assert.equal(selected?.length === 3 && selected[0].identity === fixture.parameter.identity &&
    selected[1].identity === fixture.projections[0].identity && selected[2].identity === fixture.projections[1].identity, true,
  "authored, operations and storage binders retain the exact canonical order");
  assert.equal(selected[0].declaration === fixture.parameterDeclaration && selected[1].declaration === fixture.declaration &&
    selected[2].declaration === fixture.declaration, true, "projected diagnostics retain the real method owner, never a fabricated type-parameter AST");
  assert.equal(selected[1].constraints === fixture.projections[0].csharpProjectionConstraints &&
    selected[2].constraints === fixture.projections[1].csharpProjectionConstraints, true,
  "native projection constraints remain the producer's identical frozen evidence");
  assert.equal(Object.isFrozen(selected) && selected.every(Object.isFrozen), true, "the complete binder vector is immutable");
});

test("native method binders reject a duplicated canonical projection identity", () => {
  const fixture = nativeBinderFixture();
  const selected = resolveCsharpCallableTypeParameters(fixture.declaration, fixture.sourceFile,
    { ...fixture.host, genericProjections: () => [fixture.projections[0], fixture.projections[0]] });
  assert.equal(selected === undefined, true, "a duplicated native slot never publishes a partial or silently deduplicated ABI");
});

test("the retired AST-only native binder input is not a compatibility path", () => {
  const fixture = nativeBinderFixture();
  assert.throws(() => resolveCsharpCallableTypeParameters(fixture.declaration, fixture.sourceFile,
    { ast: fixture.host.ast, types: fixture.host.types }), TypeError,
  "a real method requires its canonical projection reader even when source syntax has only one binder");
});
