import assert from "node:assert/strict";
import test from "node:test";

import {
  dotnetTypeRefToTargetTypeRef,
} from "../../../../dist/public/provider-dotnet.js";
import {
  substituteTargetTypeParameters,
} from "../../../../dist/public/provider.js";

test(".NET delegate target facts preserve exact optional parameter positions", () => {
  const targetType = dotnetTypeRefToTargetTypeRef({
    kind: "named",
    targetId: "Example.Callback",
    metadataName: "Example.Callback",
    renderShape: {
      kind: "named",
      namespace: ["Example"],
      name: "Callback",
    },
    sourceShape: {
      kind: "function",
      id: "Example.Callback.Invoke",
      parameters: [
        {
          name: "value",
          type: { kind: "type-parameter", name: "T" },
          passingMode: "by-value",
          optional: true,
        },
        {
          name: "required",
          type: { kind: "string" },
          passingMode: "by-value",
        },
      ],
      returnType: { kind: "void" },
    },
  });

  assert.deepEqual(
    targetType.csharpDelegateSignature.optionalParameterIndexes,
    [0],
  );
  const closed = substituteTargetTypeParameters(
    targetType,
    new Map([["T", { kind: "source-primitive", name: "int32" }]]),
  );
  assert.deepEqual(
    closed.csharpDelegateSignature.optionalParameterIndexes,
    [0],
  );
  assert.deepEqual(closed.csharpDelegateSignature.parameters[0], {
    kind: "source-primitive",
    name: "int32",
  });
  assert.equal(
    closed.csharpDelegateSignature.parameters[1].id,
    "System.String",
  );
});
