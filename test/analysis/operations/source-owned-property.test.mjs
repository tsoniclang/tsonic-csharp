import assert from "node:assert/strict";
import test from "node:test";
import { classifySourceOwnedMember } from "../../../dist/analysis/operations/member-access.js";

const receiver = {};
const expression = {};
const declaration = {};
const receiverType = { kind: "declared", declaration: {}, typeArguments: [] };
const readType = { kind: "primitive", primitive: "int32" };
const integer = { kind: "source-primitive", name: "int32" };
const carrier = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "Project.Owner" };
const member = {
  sourceKey: { kind: "property", name: "value" }, sourceName: "value", targetName: "value",
  sourceSubjects: [declaration], sourceDeclarations: [declaration], memberKind: "property", type: integer,
};

for (const kind of ["class", "interface"]) {
  for (const optionalChain of [false, true]) {
    test(`${kind} member access selects only the required shape, optional=${optionalChain}`, () => {
      let derivations = 0;
      const shape = { targetType: carrier, members: [member] };
      const policy = {
        ast: { is: { IsElementAccessExpression: () => false } },
        facts: { selections: { memberAccess: () => undefined } },
        types: {
          value: node => node === receiver ? carrier : integer,
          represent: descriptor => descriptor === receiverType ? carrier : integer,
          readStorage: () => integer,
        },
        projectTypes: { catalog: { definitionForTarget: type => type === carrier ? { kind } : undefined } },
        objectShapes: {
          resolveNode(node) {
            assert.notEqual(kind, "class", "Nominal dispatch must not derive unused structural contracts");
            assert.strictEqual(node, receiver);
            derivations += 1;
            return shape;
          },
        },
      };
      // The Host member selection (SourceMemberAccessSelection) carries the receiver, its selected type and the read result.
      const selection = { kind: "source-owned", source: {
        use: expression, receiver, receiverType, name: "value", selected: { kind: "member", declarations: [declaration] },
        result: readType, access: "read", optionalChain,
      } };
      const result = classifySourceOwnedMember(policy, selection);
      assert.equal(derivations, kind === "class" ? 0 : 1);
      assert.strictEqual(result.selectedReceiverType, carrier);
      assert.deepEqual(result.selectedSubjects, [declaration]);
      assert.equal(Object.hasOwn(result, "jsValueProperty") || Object.hasOwn(result, "jsValuePropertyWrite"), false,
        "native source members publish no retired pseudo-object classification");
      assert.equal(result.runtimeUnionProperty.kind, "not-runtime-union");
      if (kind === "class") assert.equal(result.objectShape, undefined);
      else {
        assert.strictEqual(result.objectShape, shape);
        assert.equal(result.shapeMember.kind, "resolved");
        assert.strictEqual(result.shapeMember.member, member);
      }
    });
  }
}
