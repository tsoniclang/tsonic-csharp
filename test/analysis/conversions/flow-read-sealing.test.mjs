import assert from "node:assert/strict";
import test from "node:test";
import { sealCsharpConversionUses } from "../../../dist/analysis/conversions/use-admission.js";

const source = Object.freeze({ kind: "source-primitive", name: "int64" });
const target = Object.freeze({ kind: "source-primitive", name: "int32" });
const operations = Object.freeze({ selectedCall: Object.freeze({ get: () => undefined }),
  selectedConstruction: Object.freeze({ get: () => undefined }) });

test("a consumed flow read seals the exact original expression conversion once before its value use", () => {
  const expression = Object.freeze({});
  const foreign = Object.freeze({});
  const selection = Object.freeze({ kind: "cast", proof: "numeric" });
  const projection = Object.freeze({ kind: "conversion", source, target, selection });
  const use = Object.freeze({ kind: "value", expression, carrier: target,
    completion: Object.freeze({ kind: "value", type: target }), children: Object.freeze([]),
    evaluation: Object.freeze({ kind: "sequence", steps: Object.freeze([]) }) });
  const seen = [];
  const requirements = [];
  const result = sealCsharpConversionUses({ entries: [{ use }, { use }] }, operations,
    (node, from, to, mode, exactInteger, boundary) => {
      seen.push({ node, from, to, mode, boundary });
      const key = boundary === undefined ? "value" : "projection";
      return { key, classification: Object.freeze({ source: from, target: to,
        selection: boundary?.selection ?? Object.freeze({ kind: "identity" }), operandStability: "snapshot" }) };
    }, () => assert.fail("a selected read projection is not a recomputed generic carrier conversion"), requirements, [], new Map(),
    { flowReadProjection: { get: node => node === expression ? projection : undefined }, issues: [] });
  const projected = seen.filter(entry => entry.boundary !== undefined);
  assert.equal(projected.length === 1, true, "duplicate Native uses publish one original read proof");
  assert.equal(projected[0].node === expression && projected[0].from === source && projected[0].to === target &&
    projected[0].mode === "implicit" && projected[0].boundary.selection === selection, true,
  "occurrence, carriers, use mode and selected conversion are retained together");
  assert.equal(result.expressions.get(expression)?.get("projection")?.selection === selection, true,
    "the planner consumes the identical selected read relation");
  assert.equal(result.expressions.get(foreign) === undefined && result.issues.length === 0, true,
    "a foreign occurrence cannot borrow the read conversion");
  assert.equal(requirements.filter(record => record.family === "expressionConversion" && record.subject === expression &&
    record.source === source && record.target === target && record.mode === "implicit").length === 1, true,
  "the required-record seal includes the exact projected read pair");
});

test("erased uses do not manufacture runtime read projections", () => {
  const expression = Object.freeze({});
  const erased = Object.freeze({ kind: "erased", expression });
  const result = sealCsharpConversionUses({ entries: [{ use: erased }] }, operations,
    () => assert.fail("an erased read has no expression conversion"),
    () => assert.fail("an erased read has no carrier conversion"), [], [], new Map(), {
      flowReadProjection: { get: () => assert.fail("an erased expression cannot demand a runtime projection") }, issues: [],
    });
  assert.equal(result.expressions.size === 0 && result.issues.length === 0, true);
});
