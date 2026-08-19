import assert from "node:assert/strict";
import test from "node:test";

import {
  csharpTargetNamedType,
  csharpTargetTypeComponents,
} from "../../../dist/policy/types/index.js";

test("target representation components include finalized object-shape members", () => {
  const int32 = { kind: "source-primitive", name: "int32" };
  const shapeType = csharpTargetNamedType("tsonic.shape:payload");
  const shape = {
    targetType: shapeType,
    members: [{
      sourceName: "value",
      targetName: "value",
      memberKind: "property",
      type: int32,
    }],
  };

  assert.deepEqual(csharpTargetTypeComponents(shapeType, shape), [int32]);
});

test("target representation components include C# carrier metadata", () => {
  const int32 = { kind: "source-primitive", name: "int32" };
  const carrier = csharpTargetNamedType(
    "Example.Collection`1",
    [int32],
    undefined,
    { enumerableElementType: int32 },
  );

  assert.deepEqual(csharpTargetTypeComponents(carrier), [int32]);
});
