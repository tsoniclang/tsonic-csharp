import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import {
  resolveTargetTypeRefForType,
} from "../dist/source/csharp-source-semantics/target-type-resolution.js";

test("target-type resolution consumes the authoritative TSTS runtime carrier without checker access", () => {
  const semanticType = {};
  const tupleCarrier = {
    kind: "tuple",
    elements: [
      { kind: "source-primitive", name: "int32" },
      { kind: "source-primitive", name: "bool" },
    ],
  };
  const context = {
    factResolver: {
      resolve(subject, factKey) {
        return subject === semanticType && factKey === runtimeCarrierFactKey
          ? { carrier: tupleCarrier }
          : undefined;
      },
    },
  };

  assert.equal(
    resolveTargetTypeRefForType(semanticType, context, {}, {}),
    tupleCarrier,
  );
});
