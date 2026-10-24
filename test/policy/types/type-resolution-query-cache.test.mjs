import assert from "node:assert/strict";
import test from "node:test";

import { createCsharpTypeResolutionQueryCache } from "../../../dist/analysis/source-evidence/types/resolution/query-cache.js";

const int32 = Object.freeze({ kind: "source-primitive", name: "int32" });
const string = Object.freeze({ kind: "source-primitive", name: "string" });
const int32Node = Object.freeze({ kind: "resolved", type: int32 });
const stringNode = Object.freeze({ kind: "resolved", type: string });

test("type-resolution queries memoize completed exact results and misses", () => {
  const cache = createCsharpTypeResolutionQueryCache();
  const node = {};
  const missingNode = {};
  const sourceFile = {};
  let resolved = 0;
  let missed = 0;

  assert.strictEqual(cache.resolveNode(node, sourceFile, () => {
    resolved += 1;
    return int32Node;
  }), int32Node);
  assert.strictEqual(cache.resolveNode(node, sourceFile, () => {
    resolved += 1;
    return stringNode;
  }), int32Node);
  assert.equal(resolved, 1);

  assert.equal(cache.resolveNode(missingNode, sourceFile, () => {
    missed += 1;
    return undefined;
  }), undefined);
  assert.equal(cache.resolveNode(missingNode, sourceFile, () => {
    missed += 1;
    return int32Node;
  }), undefined);
  assert.equal(missed, 1);
});

test("type-resolution query identities include source context and query purpose", () => {
  const cache = createCsharpTypeResolutionQueryCache();
  const node = {};
  const firstSourceFile = {};
  const secondSourceFile = {};

  assert.strictEqual(
    cache.resolveNode(node, firstSourceFile, () => int32Node),
    int32Node,
  );
  assert.strictEqual(
    cache.resolveNode(node, secondSourceFile, () => stringNode),
    stringNode,
  );
  assert.strictEqual(
    cache.resolveStorage(node, firstSourceFile, () => string),
    string,
  );
  assert.strictEqual(
    cache.resolveReadStorage(node, firstSourceFile, () => int32),
    int32,
  );
});

test("type-resolution queries never publish nested in-progress results", () => {
  const cache = createCsharpTypeResolutionQueryCache();
  const outer = {};
  const nested = {};
  const sourceFile = {};
  let nestedResolutions = 0;

  assert.strictEqual(cache.resolveNode(outer, sourceFile, () => {
    assert.strictEqual(cache.resolveNode(nested, sourceFile, () => {
      nestedResolutions += 1;
      return int32Node;
    }), int32Node);
    return stringNode;
  }), stringNode);

  assert.strictEqual(cache.resolveNode(nested, sourceFile, () => {
    nestedResolutions += 1;
    return stringNode;
  }), stringNode);
  assert.equal(nestedResolutions, 2);
});

test("the existing node cache preserves the actual immutable rejection and original input context", () => {
  const cache = createCsharpTypeResolutionQueryCache();
  const parameter = {};
  const sourceFile = {};
  const otherSourceFile = {};
  const rejected = Object.freeze({ kind: "rejected", subject: parameter, code: "CSHARP_SOURCE_STORAGE_NOT_PROVEN",
    reason: "Actual native formal demand is unresolved." });
  let selections = 0;
  const first = cache.resolveNode(parameter, sourceFile, () => { selections += 1; return rejected; });
  const second = cache.resolveNode(parameter, sourceFile, () => { selections += 1; return int32Node; });
  assert.equal(first === rejected && second === rejected && Object.isFrozen(second), true,
    "the precise first owner result is retained, not recreated from another/default-free carrier");
  assert.equal(second.kind === "rejected" && second.subject === parameter && second.code === rejected.code && second.reason === rejected.reason, true,
    "actual source identity and complete rejection reason travel together through the canonical cache");
  assert.equal(selections, 1, "a completed rejected selection is computed once just like a resolved selection");
  assert.equal(cache.resolveNode(parameter, otherSourceFile, () => int32Node) === int32Node, true,
    "a genuinely different source context retains its independent native selection");
  assert.equal(cache.resolveStorage(parameter, sourceFile, () => string) === string, true,
    "physical storage remains a different query purpose, not a competing native-node resolution path");
});
