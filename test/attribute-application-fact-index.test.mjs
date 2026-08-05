import assert from "node:assert/strict";
import test from "node:test";

import {
  tsonicAttributeBuilderFactKey,
} from "@tsonic/source-core";
import {
  createCsharpAttributeApplicationFactIndex,
} from "../dist/translate/attributes/application-fact-index.js";

test("attribute application facts are indexed once per project source node", () => {
  const firstApplication = Object.freeze({ kind: "application", attributeType: {}, arguments: [], applicationTarget: {} });
  const secondApplication = Object.freeze({ kind: "application", attributeType: {}, arguments: [], applicationTarget: {} });
  const firstSourceFile = {};
  const firstCall = {};
  const firstArgument = {};
  const secondSourceFile = {};
  const secondCall = {};
  const children = new Map([
    [firstSourceFile, [firstCall, firstArgument]],
    [secondSourceFile, [secondCall]],
  ]);
  const facts = new Map([
    [firstCall, firstApplication],
    [secondCall, secondApplication],
  ]);
  let factReads = 0;
  const index = createCsharpAttributeApplicationFactIndex({
    ast: {
      forEachChild(node, callback) {
        for (const child of children.get(node) ?? []) {
          callback(child);
        }
      },
    },
    sourceFiles: [firstSourceFile, secondSourceFile],
    sourceFacts: {
      getFact(subject, key) {
        factReads += 1;
        assert.equal(key, tsonicAttributeBuilderFactKey);
        return facts.get(subject);
      },
    },
  });

  assert.deepEqual(index.all, [firstApplication, secondApplication]);
  assert.deepEqual(index.forSourceFile(firstSourceFile), [firstApplication]);
  assert.deepEqual(index.forSourceFile(secondSourceFile), [secondApplication]);
  assert.deepEqual(index.forSourceFile({}), []);
  assert.equal(factReads, 5);
  assert.equal(Object.isFrozen(index.all), true);
  assert.equal(Object.isFrozen(index.forSourceFile(firstSourceFile)), true);
});
