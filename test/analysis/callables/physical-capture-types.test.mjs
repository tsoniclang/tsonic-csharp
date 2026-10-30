import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpCaptureStorage } from "../../../dist/analysis/callables/storage/capture-storage.js";
import { csharpRuntimeLocationTargetType, csharpRuntimeNativeArrayTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

test("physical capture decisions are complete before publication and final reads do not select backing", () => {
  const scalar = { kind: "source-primitive", name: "int64" };
  const parameter = { kind: "type-parameter", name: "Value", identity: "test.Value" };
  const declarations = Array.from({ length: 4 }, () => ({}));
  const layout = { pointeeType: scalar };
  let closed = false;
  const lookup = selected => ({ get(node) {
    assert.equal(closed, false, "native backing is an analysis-only input");
    return selected.get(node);
  } });
  const storage = { nativeBacking: lookup(new Map([[declarations[0], layout]])),
    nativeArray: lookup(new Map([[declarations[1], { layout }]])),
    storageType: lookup(new Map([[declarations[2], scalar]])) };
  const source = { ast: {}, navigation: { sourceFiles: [] } };
  const result = analyzeCsharpCaptureStorage(source, { knownShapes: () => [] }, storage, {},
    declarations.map(declaration => ({ declaration, type: parameter, mutable: false })),
    { get: () => undefined, closedInputType: () => undefined }, { get: () => false });
  assert.equal(result.issues.length, 0);
  closed = true;
  const expected = [csharpRuntimeLocationTargetType(scalar), csharpRuntimeNativeArrayTargetType(scalar), scalar, parameter];
  for (const [index, declaration] of declarations.entries()) {
    const selected = result.physicalStorageType.get(declaration, parameter);
    assert.equal(targetTypeRefEquals(selected, expected[index]), true, `physical capture ${index}`);
    assert.equal(result.physicalStorageType.get(declaration, parameter) === selected, true, "repeated reads do not rebuild carriers");
  }
  assert.equal(result.physicalStorageType.get(declarations[3], scalar) === scalar, true,
    "stored identity projection accepts the actual native generic substitution without another decision");
  assert.throws(() => result.physicalStorageType.get({}, scalar), /completed analysis decision/u);
});
