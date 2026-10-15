import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpObjectShapeMemberResolver } from "../../../dist/policy/types/objects/object-shape-policy/member-evidence.js";

const carrier = Object.freeze({ kind: "source-primitive", name: "int64" });
const destinationType = {};
const sourceType = {};
const destinationSymbol = {};
const sourceSymbol = {};
const sourceDeclaration = {};
const destination = Object.freeze({ property: { symbol: destinationSymbol, rootSymbols: [], type: {} }, declarations: [] });
const source = Object.freeze({ property: { symbol: sourceSymbol, rootSymbols: [], type: {} }, declarations: [sourceDeclaration] });
const member = Object.freeze({ sourceName: "count", targetName: "count", type: carrier,
  sourceSubjects: [destinationSymbol], sourceDeclarations: [], memberKind: "property" });

function select(pairs, kind = "available", selectedMember = member) {
  const resolver = createCsharpObjectShapeMemberResolver({});
  return resolver.instantiateMemberEvidence([selectedMember], sourceType, {
    types: { structuralMembers(actual, expected) {
      assert.strictEqual(actual, sourceType);
      assert.strictEqual(expected, destinationType);
      return { kind, members: pairs };
    } },
  }, destinationType);
}

test("structural receiver evidence uses exact checker correspondence without changing native storage", () => {
  const selected = select([{ kind: "present", source, destination }]);
  assert.equal(selected?.length, 1);
  assert.strictEqual(selected[0].type, carrier);
  assert.deepEqual(selected[0].sourceSubjects, [destinationSymbol, sourceSymbol, sourceDeclaration]);
  assert.deepEqual(selected[0].sourceDeclarations, [sourceDeclaration]);
  assert.strictEqual(selected[0].sourceTypes[0], source.property.type);
  assert.equal(Object.isFrozen(selected[0].sourceSubjects), true);
});

test("structural instance declarations retain only the exact selected producer occurrence", () => {
  const earlierDeclaration = {};
  const selectedMember = { ...member, sourceSubjects: [destinationSymbol, earlierDeclaration],
    sourceDeclarations: [earlierDeclaration] };
  const selected = select([{ kind: "present", source, destination }], "available", selectedMember);
  assert.deepEqual(selected[0].sourceDeclarations, [sourceDeclaration]);
  assert.equal(selected[0].sourceSubjects.includes(earlierDeclaration), true);
  assert.deepEqual(selectedMember.sourceDeclarations, [earlierDeclaration]);
  assert.equal(Object.isFrozen(selected[0].sourceDeclarations), true);
});

test("structural receiver evidence rejects absent, ambiguous and unrelated destination identities", () => {
  assert.equal(select([{ kind: "absent", destination }]) === undefined, true, "absent member");
  const present = { kind: "present", source, destination };
  assert.equal(select([present, present]) === undefined, true, "ambiguous member");
  assert.equal(select([{ ...present, destination: { ...destination, property: { ...destination.property, symbol: {} } } }]) === undefined, true, "unrelated destination");
  assert.equal(select([], "unavailable") === undefined, true, "unavailable correspondence");
});
