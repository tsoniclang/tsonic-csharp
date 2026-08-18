import assert from "node:assert/strict";
import test from "node:test";

import { tsonicAttributeBuilderFactKey } from "@tsonic/source-core/facts";
import {
  createCsharpAttributeApplicationFactIndex,
} from "../../../dist/analysis/attributes/application-index.js";

test("attribute application facts enter C# through one target-owned index", () => {
  const builderState = Object.freeze({ kind: "builder-state", applicationTarget: {} });
  const firstApplication = Object.freeze({ kind: "application", attributeType: {}, arguments: [], applicationTarget: {} });
  const secondApplication = Object.freeze({ kind: "application", attributeType: {}, arguments: [], applicationTarget: {} });
  const firstSourceFile = {};
  const builderCall = {};
  const firstCall = {};
  const firstArgument = {};
  const secondSourceFile = {};
  const secondCall = {};
  const children = new Map([
    [firstSourceFile, [builderCall, firstCall, firstArgument]],
    [secondSourceFile, [secondCall]],
  ]);
  const facts = new Map([
    [builderCall, builderState],
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

  const firstCsharpApplication = {
    kind: "csharp-attribute-application",
    attributeType: firstApplication.attributeType,
    arguments: [],
    applicationTarget: firstApplication.applicationTarget,
  };
  const secondCsharpApplication = {
    kind: "csharp-attribute-application",
    attributeType: secondApplication.attributeType,
    arguments: [],
    applicationTarget: secondApplication.applicationTarget,
  };
  const csharpBuilderState = {
    kind: "csharp-attribute-builder-state",
    applicationTarget: builderState.applicationTarget,
  };

  assert.deepEqual(index.all, [firstCsharpApplication, secondCsharpApplication]);
  assert.deepEqual(index.forSourceFile(firstSourceFile), [firstCsharpApplication]);
  assert.deepEqual(index.forSourceFile(secondSourceFile), [secondCsharpApplication]);
  assert.deepEqual(index.forSourceFile({}), []);
  assert.deepEqual(index.forSubject(builderCall), csharpBuilderState);
  assert.deepEqual(index.forSubject(firstCall), firstCsharpApplication);
  assert.deepEqual(index.forSubject(secondCall), secondCsharpApplication);
  assert.equal(index.forSubject(firstArgument), undefined);
  assert.notEqual(index.forSubject(firstCall), firstApplication);
  assert.notEqual(index.forSubject(builderCall), builderState);
  assert.equal(factReads, 6);
  assert.equal(Object.isFrozen(index.all), true);
  assert.equal(Object.isFrozen(index.forSourceFile(firstSourceFile)), true);
  assert.equal(Object.isFrozen(index.forSubject(builderCall)), true);
  assert.equal(Object.isFrozen(index.forSubject(firstCall)), true);
  assert.equal(Object.isFrozen(index.forSubject(firstCall).arguments), true);
});
