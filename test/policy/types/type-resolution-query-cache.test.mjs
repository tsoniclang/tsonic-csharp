import assert from "node:assert/strict";
import test from "node:test";

import {
  createCsharpTypeResolutionQueryCache,
} from "../../../dist/policy/types/resolution/query-cache.js";

const int32 = Object.freeze({ kind: "source-primitive", name: "int32" });
const string = Object.freeze({ kind: "source-primitive", name: "string" });

test("type-resolution queries memoize completed exact results and misses", () => {
  const cache = createCsharpTypeResolutionQueryCache();
  const node = {};
  const missingNode = {};
  const sourceFile = {};
  let resolved = 0;
  let missed = 0;

  assert.strictEqual(cache.resolveNode(node, sourceFile, () => {
    resolved += 1;
    return int32;
  }), int32);
  assert.strictEqual(cache.resolveNode(node, sourceFile, () => {
    resolved += 1;
    return string;
  }), int32);
  assert.equal(resolved, 1);

  assert.equal(cache.resolveNode(missingNode, sourceFile, () => {
    missed += 1;
    return undefined;
  }), undefined);
  assert.equal(cache.resolveNode(missingNode, sourceFile, () => {
    missed += 1;
    return int32;
  }), undefined);
  assert.equal(missed, 1);
});

test("type-resolution query identities include source context and query purpose", () => {
  const cache = createCsharpTypeResolutionQueryCache();
  const node = {};
  const firstSourceFile = {};
  const secondSourceFile = {};

  assert.strictEqual(
    cache.resolveNode(node, firstSourceFile, () => int32),
    int32,
  );
  assert.strictEqual(
    cache.resolveNode(node, secondSourceFile, () => string),
    string,
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
      return int32;
    }), int32);
    return string;
  }), string);

  assert.strictEqual(cache.resolveNode(nested, sourceFile, () => {
    nestedResolutions += 1;
    return string;
  }), string);
  assert.equal(nestedResolutions, 2);
});
