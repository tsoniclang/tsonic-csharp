import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpObjectShapeMemberResolver } from "../../../dist/policy/types/objects/object-shape-policy/member-evidence.js";

function scenario(rejectedIndex, count = 3) {
  const carriers = Array.from({ length: count }, () => ({ kind: "source-primitive", name: "int64" }));
  const properties = carriers.map((type, index) => ({ name: `field${index}`, symbol: {}, rootSymbols: [], type,
    optional: index === 1, readonly: index === 2 }));
  const selected = [];
  const resolver = createCsharpObjectShapeMemberResolver({
    ast: { is: {
      IsMethodDeclaration: () => false, IsMethodSignatureDeclaration: () => false,
      IsGetAccessorDeclaration: () => false, IsSetAccessorDeclaration: () => false,
    } },
    typeResolver: { resolveType(type) {
      const index = carriers.indexOf(type);
      selected.push(index);
      return index === rejectedIndex ? undefined : type;
    } },
    memoryBindings: { hasBoundField: () => false },
  });
  const queries = {
    sourceFile: {},
    declarations: { typeSymbol: () => undefined, symbolDeclarations: () => [] },
    types: { propertyInfos: () => properties, isNumberLike: () => false, isBigIntLike: () => false },
  };
  return { resolver, queries, selected, carriers };
}

test("structural members stop at the first unavailable carrier without publishing a partial shape", () => {
  for (const rejectedIndex of [0, 1, 2]) {
    const { resolver, queries, selected } = scenario(rejectedIndex);
    assert.equal(resolver.deriveMembers({}, queries, { depth: 0 }) === undefined, true, `rejected field${rejectedIndex}`);
    assert.deepEqual(selected, Array.from({ length: rejectedIndex + 1 }, (_, index) => index));
  }
});

test("structural member rejection does no later resolver work even for a wide record", () => {
  const { resolver, queries, selected } = scenario(0, 256);
  assert.equal(resolver.deriveMembers({}, queries, { depth: 0 }) === undefined, true, "the exact unavailable record stays unavailable");
  assert.deepEqual(selected, [0]);
});

test("complete structural records preserve member order, native carriers and optional/readonly evidence", () => {
  const { resolver, queries, selected, carriers } = scenario(-1);
  const members = resolver.deriveMembers({}, queries, { depth: 0 });
  assert.equal(members?.length === 3, true, "complete closed member collection");
  assert.deepEqual(selected, [0, 1, 2]);
  assert.deepEqual(members.map(member => member.sourceName), ["field0", "field1", "field2"]);
  assert.equal(members[0].type === carriers[0] && members[2].type === carriers[2], true, "exact native carrier identities");
  assert.equal(members[1].optional, true);
  assert.equal(members[2].readonly, true);
  assert.deepEqual(members.map(member => member.sourceTypes[0]), carriers);
});
