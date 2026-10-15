import assert from "node:assert/strict";
import test from "node:test";
import { readTargetParityInventory, targetReferenceFindings } from "../../../tsonic/test/architecture/tooling/target-parity-inventory.mjs";

test("shared C#/Rust structural references remain resolvable, not an execution-parity claim", () => {
  assert.deepEqual(targetReferenceFindings(readTargetParityInventory("language-lanes")), []);
});
