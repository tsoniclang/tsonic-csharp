import assert from "node:assert/strict";
import test from "node:test";
import { classifySourceOwnedMember } from "../../../dist/analysis/operations/member-access.js";

const receiver = {};
const expression = {};
const declaration = {};
const sourceType = {};
const sourceFile = {};
const integer = { kind: "source-primitive", name: "int32" };
const carrier = { kind: "target-named", id: "Project.Owner" };
const member = {
  sourceKey: { kind: "property", name: "value" }, sourceName: "value", targetName: "value",
  sourceSubjects: [declaration], sourceTypes: [sourceType], memberKind: "property", type: integer,
};

for (const kind of ["class", "interface"]) {
  for (const optionalChain of [false, true]) {
    test(`${kind} member access selects only the required shape, optional=${optionalChain}`, () => {
      let derivations = 0;
      const shape = { targetType: carrier, members: [member] };
      const policy = {
        ast: { is: { IsElementAccessExpression: () => false } },
        semantics: () => ({
          facts: { selectedSubjects: () => [declaration] },
          types: { relationship: () => "identical" },
          operations: { propertyAccess: () => undefined },
        }),
        types: {
          resolveNode: node => node === receiver ? carrier : integer,
          resolveSelectedValue: node => node === receiver ? carrier : integer,
          resolveReadStorage: () => integer,
        },
        projectTypes: { catalog: { definitionForTarget: type => type === carrier ? { kind } : undefined } },
        objectShapes: {
          resolveNode(node, file) {
            assert.notEqual(kind, "class", "Nominal dispatch must not derive unused structural contracts");
            assert.strictEqual(node, receiver);
            assert.strictEqual(file, sourceFile);
            derivations += 1;
            return shape;
          },
        },
      };
      const selection = { kind: "source-owned", source: {
        receiver: { expression: receiver, type: {} }, expression,
        selectedDeclaration: declaration, selectedSymbol: {}, sourceReadType: sourceType,
        optionalChain,
      } };
      const result = classifySourceOwnedMember(policy, selection, sourceFile);
      assert.equal(derivations, kind === "class" ? 0 : 1);
      assert.strictEqual(result.selectedReceiverType, carrier);
      assert.deepEqual(result.selectedSubjects, [declaration]);
      assert.equal(result.jsValueProperty.kind, "not-js-value-object-shape");
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
