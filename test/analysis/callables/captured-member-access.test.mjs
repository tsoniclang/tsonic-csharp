import assert from "node:assert/strict";
import test from "node:test";
import { csharpCapturedMemberAccess } from "../../../dist/analysis/callables/captured-member-access.js";

test("hoisted native callbacks request access only to exact selected restricted members", () => {
  const privateMember = { access: "private" };
  const protectedMember = { access: "protected" };
  const indexedMember = { access: "private" };
  const privateName = { kind: "private-name" };
  const hashMember = { name: privateName };
  const publicMember = {};
  const nestedMember = { access: "private" };
  const access = declaration => ({ kind: "access", declaration });
  const nested = { kind: "class", children: [access(nestedMember)] };
  const body = { children: [access(privateMember), access(protectedMember), access(hashMember),
    access(publicMember), access(privateMember), { kind: "index", declaration: indexedMember }, nested] };
  const source = { ast: {
    is: { IsPropertyAccessExpression: node => node?.kind === "access", IsClassDeclaration: node => node?.kind === "class",
      IsElementAccessExpression: node => node?.kind === "index",
      IsClassExpression: () => false, IsPrivateIdentifier: node => node?.kind === "private-name" },
    hasModifierKind: (node, modifier) => node.access === modifier, name: node => node.name,
    forEachChild: (node, visit) => (node.children ?? []).forEach(visit),
  }, semantics: { forNode: () => ({ operations: {
    propertyAccess: node => ({ selectedDeclaration: node.declaration }),
    elementAccess: node => ({ selectedDeclaration: node.declaration }),
  } }) } };
  const members = csharpCapturedMemberAccess(source, [{ methods: [{ declaration: body }, { declaration: body }] }]);
  assert.equal(members.size, 4);
  for (const declaration of [privateMember, protectedMember, hashMember, indexedMember])
    assert.equal(members.has(declaration), true, "exact private/protected access requested by the native helper");
  for (const declaration of [publicMember, nestedMember, { ...privateMember }])
    assert.equal(members.has(declaration), false, "public, nested-owner and unrelated equal-looking declarations stay unchanged");
});
