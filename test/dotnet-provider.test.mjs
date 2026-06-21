import assert from "node:assert/strict";
import test from "node:test";

import {
  dotnetModuleToProviderDeclarationModel,
  dotnetTypeRefToTargetTypeRef,
} from "../dist/index.js";

test(".NET provider declaration model preserves explicit target parameter passing modes", () => {
  const model = dotnetModuleToProviderDeclarationModel({
    moduleSpecifier: "@tsonic/dotnet/System.Collections.Generic.js",
    namespaceName: "System.Collections.Generic",
    exports: [
      {
        kind: "type",
        typeKind: "class",
        sourceName: "Dictionary",
        namespaceName: "System.Collections.Generic",
        metadataName: "System.Collections.Generic.Dictionary`2",
        members: [
          {
            kind: "method",
            sourceName: "tryGetValue",
            targetName: "TryGetValue",
            metadataName: "System.Collections.Generic.Dictionary`2.TryGetValue(TKey,TValue)",
            signatures: [
              {
                id: "System.Collections.Generic.Dictionary`2.TryGetValue(TKey,TValue)",
                parameters: [
                  {
                    name: "key",
                    type: { kind: "type-parameter", name: "TKey" },
                    passingMode: "by-value",
                  },
                  {
                    name: "value",
                    type: { kind: "type-parameter", name: "TValue" },
                    passingMode: "byref-writeonly-must-init",
                  },
                ],
                returnType: { kind: "source-primitive", name: "bool" },
              },
            ],
          },
        ],
      },
    ],
  });

  const dictionary = model.exports[0];
  const tryGetValue = dictionary.members[0];
  const signature = tryGetValue.signatures[0];

  assert.equal(signature.name, "TryGetValue");
  assert.equal(signature.parameters[0].passingMode, undefined);
  assert.equal(signature.parameters[1].passingMode, "byref-writeonly-must-init");
});

test(".NET target refs do not promote any or unknown to CLR object", () => {
  assert.deepEqual(dotnetTypeRefToTargetTypeRef({ kind: "any" }), { kind: "opaque", id: "any" });
  assert.deepEqual(dotnetTypeRefToTargetTypeRef({ kind: "unknown" }), { kind: "opaque", id: "unknown" });
  assert.deepEqual(dotnetTypeRefToTargetTypeRef({ kind: "object" }), { kind: "target-named", id: "System.Object" });
});
