import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram } from "../../representation/host-fixture.mjs";
import { csharpCapturedMemberAccess } from "../../../dist/analysis/callables/values/captured-member-access.js";

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
  // nextgen C-2542: TargetSourceProgramFacts double; the selected member is the Host member-access selection
  // (selections.memberAccess) or element-access record (values.elementAccess), not a checker selectedDeclaration.
  const source = { syntax: {
    is: { IsPropertyAccessExpression: node => node?.kind === "access", IsClassDeclaration: node => node?.kind === "class",
      IsElementAccessExpression: node => node?.kind === "index",
      IsClassExpression: () => false, IsPrivateIdentifier: node => {
        assert.equal(node !== undefined, true, "the native AST predicate requires an actual name node");
        return node.kind === "private-name";
      } },
    hasModifierKind: (node, modifier) => node.access === modifier, name: node => node.name,
    forEachChild: (node, visit) => (node.children ?? []).forEach(visit),
  }, facts: {
    selections: { memberAccess: node => ({ selected: { kind: "member", declarations: [node.declaration] } }) },
    values: { elementAccess: node => ({ selected: { kind: "member", declaration: node.declaration, name: "indexed" } }) },
  } };
  const members = csharpCapturedMemberAccess(source, [{ methods: [{ declaration: body }, { declaration: body }] }]);
  assert.equal(members.size, 4);
  for (const declaration of [privateMember, protectedMember, hashMember, indexedMember])
    assert.equal(members.has(declaration), true, "exact private/protected access requested by the native helper");
  for (const declaration of [publicMember, nestedMember, { ...privateMember }])
    assert.equal(members.has(declaration), false, "public, nested-owner and unrelated equal-looking declarations stay unchanged");
});

test("checked captured index signatures have no private name and retain exact restricted field selection", () => {
  const program = hostProgram(`
      interface Counts { [key: string]: number; }
      class Base { protected inherited = 1; }
      export class Counter extends Base {
        private value = 2;
        #token = 3;
        visible = 4;
        capture(values: Counts) {
          let adjustment = 0;
          return () => values["total"]! + this.value + this.inherited + this.#token + this.visible + ++adjustment;
        }
      }
    `);
  const source = Object.freeze({ syntax: program.ast, facts: program.facts, sourceFiles: program.files });
  const file = program.files[0];
  assert.equal(file !== undefined, true);
  const fields = new Map();
  let closure;
  let index;
  const visit = node => {
    if (source.syntax.is.IsPropertyDeclaration(node)) fields.set(source.syntax.text(source.syntax.name(node)), node);
    if (source.syntax.is.IsArrowFunction(node)) closure = node;
    if (source.syntax.is.IsElementAccessExpression(node)) index = node;
    source.syntax.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  assert.equal(closure !== undefined && index !== undefined, true);
  const record = source.facts.values.elementAccess(index).selected;
  const selected = record.kind === "index-signature" ? record.declaration : undefined;
  assert.equal(selected !== undefined && source.syntax.is.IsIndexSignatureDeclaration(selected), true,
    "the checker selects the real unnamed index signature");
  assert.equal(source.syntax.name(selected) === undefined, true);
  const members = csharpCapturedMemberAccess(source, [{ methods: [{ declaration: closure }] }]);
  assert.equal(members.size, 3);
  for (const name of ["value", "inherited", "#token"]) {
    assert.equal(fields.has(name) && members.has(fields.get(name)), true, `exact restricted field ${name}`);
  }
  assert.equal(members.has(fields.get("visible")) || members.has(selected), false,
    "public fields and unnamed index signatures are not private members");
});
