import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  objectShapeMemberTargetName,
  objectShapeMemberTargetNameForKey,
} from "../../../dist/policy/identities/source-member-names.js";

const stable = (sourceName) => `__tsonic_member_${createHash("sha256").update(sourceName).digest("hex")}`;

test("a plain C# identifier keeps its authored source spelling as the member name", () => {
  for (const name of ["value", "URLValue", "_private", "camelCase2"]) {
    assert.equal(objectShapeMemberTargetName(name), name);
  }
});

test("numeric, empty, punctuated and reserved-word keys get one stable name derived from the exact source name", () => {
  for (const name of ["0", "", "content-type", "has space", "class", "namespace", "ünïcode"]) {
    assert.equal(objectShapeMemberTargetName(name), stable(name), JSON.stringify(name));
  }
  assert.notEqual(objectShapeMemberTargetName("a-b"), objectShapeMemberTargetName("a_b"));
  assert.equal(objectShapeMemberTargetName("a-b"), objectShapeMemberTargetName("a-b"));
});

test("a source member key selects its native member name; well-known symbols map only to their native members", () => {
  assert.equal(objectShapeMemberTargetNameForKey({ kind: "property", name: "content-type" }), stable("content-type"));
  assert.equal(objectShapeMemberTargetNameForKey({ kind: "property", name: "value" }), "value");
  assert.equal(objectShapeMemberTargetNameForKey({ kind: "well-known-symbol", symbol: "dispose" }), "Dispose");
  assert.equal(objectShapeMemberTargetNameForKey({ kind: "well-known-symbol", symbol: "async-dispose" }), "DisposeAsync");
  for (const symbol of ["iterator", "async-iterator", "to-primitive", "species"]) {
    assert.equal(objectShapeMemberTargetNameForKey({ kind: "well-known-symbol", symbol }), undefined, symbol);
  }
});
