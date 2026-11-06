import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpStructuralInterface } from "../../../dist/analysis/objects/structural-interfaces.js";
import { analyzeCsharpObjectShapes } from "../../../dist/analysis/objects/analyze.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";

function fixture() {
  const sourceType = Object.freeze({});
  const destinationType = Object.freeze({});
  const sourceSymbol = Object.freeze({});
  const destinationSymbol = Object.freeze({});
  const integer = Object.freeze({ kind: "source-primitive", name: "int64" });
  const member = symbol => ({
    sourceKey: { kind: "property", name: "value" }, sourceName: "value", targetName: "value",
    memberKind: "property", type: integer, sourceSubjects: [symbol],
  });
  const source = {
    targetType: { kind: "target-named", id: "test.Source", csharpAllowsRefLikeTypeArguments: [], csharpStructuralContract: true },
    sourceType, members: [member(sourceSymbol)],
  };
  const destination = {
    targetType: { kind: "target-named", id: "test.View", csharpAllowsRefLikeTypeArguments: [], csharpStructuralContract: true },
    sourceType: destinationType, members: [member(destinationSymbol)],
  };
  const shapes = new Map([source, destination].map(shape => [targetTypeRefKey(shape.targetType), shape]));
  let rawReads = 0;
  let relationReads = 0;
  const policy = {
    sourceFiles: [], objectShapes: { resolveTarget: type => shapes.get(targetTypeRefKey(type)) },
    projectTypes: { directSupertypes: () => [] },
    semanticsFor: () => ({ types: {
      expressionType() { rawReads += 1; return sourceType; },
      structuralMembers(from, to, purpose) {
        relationReads += 1;
        assert.equal(purpose, "read");
        if (from !== sourceType || to !== destinationType) return { kind: "unavailable", reason: "disjoint-shape" };
        return { kind: "available", destination: { calls: [], constructs: [], indexes: [] }, members: [{
          kind: "present",
          source: { property: { symbol: sourceSymbol, rootSymbols: [] }, declarations: [] },
          destination: { property: { symbol: destinationSymbol, rootSymbols: [] }, declarations: [] },
        }] };
      },
    } }),
  };
  return { policy, source, destination, sourceType, rawReads: () => rawReads, relationReads: () => relationReads };
}

test("structural interface selection consumes only its supplied checked proof endpoint", () => {
  const value = fixture();
  const selected = selectCsharpStructuralInterface(value.policy, {}, value.source, value.destination, value.sourceType);
  assert.equal(selected?.properties.length, 1, "the original exact readable member relation is retained");
  assert.equal(value.rawReads(), 0, "no expression Type query is needed");
  assert.equal(value.relationReads(), 1, "the distinct-owner checked proof is not removed");
});

test("missing structural interface evidence never retries the expression or borrows a shape endpoint", () => {
  const value = fixture();
  assert.equal(selectCsharpStructuralInterface(value.policy, {}, value.source, value.destination, undefined) === undefined,
    true, "an absent explicit input stays unavailable");
  assert.equal(selectCsharpStructuralInterface(value.policy, {}, value.source, value.destination) === undefined,
    true, "the removed optional-input form has no fallback");
  assert.equal(value.rawReads(), 0, "missing proof is not reconstructed");
  assert.equal(value.relationReads(), 0, "a retained shape does not choose the current Source endpoint");
});

test("foreign explicit structural evidence cannot be replaced by a remembered shape Type", () => {
  const value = fixture();
  assert.equal(selectCsharpStructuralInterface(value.policy, {}, value.source, value.destination, Object.freeze({})) === undefined,
    true, "the exact checked relation rejects a different supplied endpoint");
  assert.equal(value.rawReads(), 0);
  assert.equal(value.relationReads(), 1);
});

test("structural registration requires the same supplied endpoint throughout its retained request", () => {
  const value = fixture();
  const builder = analyzeCsharpObjectShapes(value.policy, { targetTypes: [] }, {});
  assert.equal(builder.registerStructuralInterface({}, value.source.targetType, value.destination.targetType, undefined),
    false, "a shape with remembered Source evidence cannot authorize an absent request input");
  assert.equal(builder.registerStructuralInterface({}, value.source.targetType, value.destination.targetType, value.sourceType),
    true, "the existing exact endpoint still admits the original relation");
  assert.equal(value.rawReads(), 0);
  assert.equal(value.relationReads(), 1);
});
