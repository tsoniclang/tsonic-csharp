import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpObjectShapeMemberResolver } from "../../../dist/analysis/objects/shapes/member-evidence.js";

const carrier = Object.freeze({ kind: "source-primitive", name: "int64" });
const destinationType = {};
const sourceType = {};
const destinationTypeSymbol = {};
const sourceTypeSymbol = {};
const destinationSymbol = {};
const sourceSymbol = {};
const sourceDeclaration = {};
const destination = Object.freeze({ receiverType: destinationType,
  property: { symbol: destinationSymbol, rootSymbols: [], type: {}, optional: false, readonly: false },
  declarations: [], getters: [], setters: [], read: "property" });
const source = Object.freeze({ receiverType: sourceType,
  property: { symbol: sourceSymbol, rootSymbols: [], type: {}, optional: false, readonly: false },
  declarations: [sourceDeclaration], getters: [], setters: [], read: "property" });
const selfPair = Object.freeze({ kind: "present", source: destination, destination });
const member = Object.freeze({ sourceName: "count", targetName: "count", type: carrier,
  sourceSubjects: [destinationSymbol], sourceDeclarations: [], memberKind: "property",
  sourceMemberEvidence: [Object.freeze({ ownerType: destinationType, sourceType: destinationType, correspondence: selfPair })] });

function select(pairs, kind = "available", selectedMember = member) {
  const resolver = createCsharpObjectShapeMemberResolver({});
  const inventory = type => ({ type, calls: [], constructs: [], indexes: [] });
  return resolver.instantiateMemberEvidence([selectedMember], sourceType, {
    declarations: { typeSymbol(type) {
      return type === destinationType ? destinationTypeSymbol : type === sourceType ? sourceTypeSymbol : undefined;
    } },
    types: { isIdentical: (actual, expected) => actual === expected, structuralMembers(actual, expected, purpose) {
      assert.equal(purpose, "correspondence", "member evidence requests checked declaration correspondence");
      assert.strictEqual(expected, destinationType);
      if (actual === destinationType) return { kind: "available", source: inventory(destinationType),
        destination: inventory(destinationType), members: [selfPair] };
      assert.strictEqual(actual, sourceType);
      return kind === "available" ? { kind, source: inventory(sourceType), destination: inventory(destinationType), members: pairs }
        : { kind, reason: "unresolved-shape" };
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
