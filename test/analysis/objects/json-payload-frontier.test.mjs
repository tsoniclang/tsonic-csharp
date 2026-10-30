import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpObjectShapeDemandEngine } from "../../../dist/analysis/objects/native-demand-requests.js";
import { publishCsharpNativeArtifactDemand } from "../../../dist/analysis/program/records/native/native-demand.js";
import { selectCsharpObjectShapePublication } from "../../../dist/analysis/names/object-shapes.js";
import { objectShapeArtifactKey } from "../../../dist/target-model/records/objects/object-shape-keys.js";
import { csharpPropertySourceMemberKey } from "../../../dist/target-model/types/source-member-keys.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";

test("JSON serializer demand retains exact immutable declaration contracts without querying source origins", () => {
  const carrier = Object.freeze({ kind: "source-primitive", name: "int32" });
  const guarded = Object.freeze({ targetType: { kind: "target-named", id: "Example.Guarded", csharpAllowsRefLikeTypeArguments: [] },
    members: Object.freeze([{ sourceKey: csharpPropertySourceMemberKey("count"), sourceName: "count", targetName: "count", memberKind: "property", type: carrier }]) });
  const ordinary = Object.freeze({ targetType: { kind: "target-named", id: "Example.Ordinary", csharpAllowsRefLikeTypeArguments: [] }, members: Object.freeze([]) });
  const shapes = new Map([guarded, ordinary].map(shape => [targetTypeRefKey(shape.targetType), shape]));
  let reads = 0;
  let closed = false;
  const forbidden = () => assert.fail("JSON publication must not query source nodes, invocation bindings or value frontiers");
  const engine = createCsharpObjectShapeDemandEngine({
    ast: {}, names: { typeParameterNames: [] }, captureStorage: { captureFrameShape: { get() {} } },
    conversions: { conversion: { get() {} } },
    sourceStorage: { get nodes() { return forbidden(); }, subjectFor: forbidden, boundValueFrontierFor: forbidden, emptyBindings: forbidden },
    objectShapes: { targetShapes: Object.freeze(Object.fromEntries(shapes)), knownShapes: () => [...shapes.values()],
      resolveTarget(type) {
        assert.equal(closed, false, "native declaration queries stop at publication");
        reads += 1;
        return type === undefined ? undefined : shapes.get(targetTypeRefKey(type));
      } },
  });
  for (const shape of [guarded, ordinary]) {
    assert.equal(engine.registerObjectShape(shape, "synthetic").kind, "accepted", "each exact native declaration is admitted");
    engine.registerGeneralJsonWriter(shape);
    engine.registerGeneralJsonWriter(shape);
  }
  const unavailable = { targetType: { kind: "target-named", id: "Example.Unavailable" }, members: [] };
  const projected = { ...guarded, members: [{ ...guarded.members[0], type: { kind: "source-primitive", name: "float64" } }] };
  for (const shape of [unavailable, projected]) assert.throws(() => engine.registerGeneralJsonWriter(shape),
    /exact admitted native shape/u, "missing or incompatible evidence cannot invent a narrowed native carrier");
  const closure = engine.close();
  closed = true;
  const publishedReads = reads;
  const demand = publishCsharpNativeArtifactDemand(selectCsharpObjectShapePublication(closure, { typeParameterNames: [] }));
  assert.equal(Object.isFrozen(demand) && Object.isFrozen(demand.artifacts), true, "one immutable completed publication");
  const selected = demand.get(objectShapeArtifactKey(guarded));
  assert.equal(selected.fact === guarded && selected.fact.members[0].type === carrier, true,
    "the exact already-decided native field carrier is retained");
  assert.equal(selected.jsonContract?.kind, "properties", "the actual declaration owns its writer");
  assert.equal(demand.get(objectShapeArtifactKey(ordinary)).jsonContract?.kind, "properties",
    "ordinary native storage has its own declaration contract, not the guarded declaration's proof");
  for (let index = 0; index < 4; index++) assert.equal(demand.get(objectShapeArtifactKey(guarded)) === selected, true,
    "later demands retain the same immutable record");
  assert.equal(reads, publishedReads, "lookup-only readers never replay native or source selection");
  assert.throws(() => engine.registerGeneralJsonWriter(guarded), /sealed/u, "late writer demand cannot strengthen publication");
});
