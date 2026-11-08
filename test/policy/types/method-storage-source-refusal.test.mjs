import assert from "node:assert/strict";
import test from "node:test";
import { csharpObjectMethodHasFixedNativeExposure } from "../../../dist/policy/types/objects/object-members.js";

test("Native method exposure forwards the identical Source storage refusal", () => {
  const site = Object.freeze({});
  const related = Object.freeze({});
  const refusal = Object.freeze({ kind: "refused", source: "tsonic", code: "TSONIC_SOURCE_FORM_UNSUPPORTED",
    message: "The original Source storage query was refused.", site, related });
  const result = csharpObjectMethodHasFixedNativeExposure(refusal);
  assert.equal(result.kind, "source-refused");
  assert.equal(result.refusal === refusal, true, "no cloned, dropped or Native-recoded refusal");
  assert.equal(Object.isFrozen(result), true);
});

test("Native method exposure requires its exact closed or external-write-only inventory", () => {
  for (const [selection, expected, label] of [
    [{ kind: "complete", writes: [] }, true, "closed unwritten method"],
    [{ kind: "complete", writes: [{}] }, false, "actual method write"],
    [{ kind: "open", writes: [], boundaries: [{ kind: "external-write" }] }, true, "external-write-only exposure"],
    [{ kind: "open", writes: [], boundaries: [] }, false, "missing boundary proof"],
    [{ kind: "open", writes: [], boundaries: [{ kind: "opaque-write" }] }, false, "opaque write"],
    [{ kind: "unresolved", reason: "The method inventory is not closed." }, false, "unresolved inventory"],
    [undefined, false, "absent inventory"],
  ]) {
    const result = csharpObjectMethodHasFixedNativeExposure(selection);
    assert.equal(result.kind, "represented", label);
    assert.equal(result.value, expected, label);
  }
});
