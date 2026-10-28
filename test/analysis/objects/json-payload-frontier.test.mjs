import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpJsonPayloadFrontier } from "../../../dist/analysis/objects/json-payload-frontier.js";
import { csharpTsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";

test("JSON producer demand retains actual narrowed subjects and invocation bindings without inventing other boundaries", () => {
  const guarded = {};
  const ordinary = {};
  const broad = {};
  const unavailable = {};
  const projected = {};
  const carrier = Object.freeze({ kind: "source-primitive", name: "int32" });
  const subjects = new Map([guarded, ordinary, broad].map(node => [node, Object.freeze({ kind: "value", node, projection: [] })]));
  const bindings = new Map();
  const original = Object.freeze({ subject: subjects.get(ordinary), bindings, kind: "origin" });
  const boundary = Object.freeze({ subject: subjects.get(guarded), bindings, kind: "boundary" });
  const expected = Object.freeze({ kind: "resolved", frontier: Object.freeze([boundary, original]) });
  let reads = 0;
  let work = 0;
  let selections = 0;
  const storage = {
    nodes: Object.freeze([guarded, ordinary, broad, unavailable, projected]),
    subjectFor(node) {
      selections += 1;
      if (node === projected) return { kind: "resolved", subject: { node: ordinary, kind: "value", projection: [{ kind: "member", declaration: {} }] } };
      return subjects.has(node) ? { kind: "resolved", subject: subjects.get(node) } : { kind: "unresolved", reason: "no checked subject" };
    },
    boundValueFrontierFor(subject, actualBindings, boundaries) {
      assert.equal(subject === subjects.get(ordinary) && actualBindings === bindings, true,
        "the actual requested source value and complete invocation context reach the shared owner");
      assert.equal(Object.isFrozen(boundaries) && boundaries.length === 1 && boundaries[0] === subjects.get(guarded), true,
        "only a real checked narrowed read with an available subject stops the origin walk");
      return expected;
    },
  };
  const frontier = createCsharpJsonPayloadFrontier(storage, { valueRead: { get(node) {
    reads += 1;
    return node === guarded || node === unavailable || node === projected ? { narrowedRead: carrier }
      : node === broad ? { narrowedRead: csharpTsValueTargetType() } : { flowReadValue: carrier };
  } } }, amount => { work += amount; });
  assert.equal(frontier.select(subjects.get(ordinary), bindings) === expected, true,
    "all guarded and unguarded alternatives retain their actual frontier rows");
  assert.equal(frontier.carrierFor(subjects.get(guarded)) === carrier, true, "the exact already-decided narrowed carrier is retained");
  for (const node of [ordinary, broad, unavailable, projected]) assert.equal(frontier.carrierFor(subjects.get(node)) === undefined, true,
    "ordinary storage, broad values and unproved subjects cannot masquerade as a guard");
  assert.equal(reads === 5 && work === 5 && selections === 3, true,
    "one finite publication reads each node once, without replaying source type or guard queries");
  frontier.select(subjects.get(ordinary), bindings);
  assert.equal(reads === 5 && work === 5 && selections === 3, true,
    "later demands consume the same immutable boundary publication");
});
