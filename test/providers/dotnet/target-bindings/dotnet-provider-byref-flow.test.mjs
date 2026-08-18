import assert from "node:assert/strict";
import test from "node:test";

import {
  dotnetExportToTargetBinding,
} from "../../../../dist/providers/dotnet/model/index.js";
import {
  testTargetId,
} from "../../../fixtures/dotnet-provider/dotnet-provider.helpers.mjs";

test(".NET target parameters preserve MaybeNull output flow as explicit C# metadata", () => {
  const dictionary = {
    kind: "type",
    typeKind: "class",
    sourceName: "Dictionary",
    namespaceName: "System.Collections.Generic",
    targetId: testTargetId("System.Collections.Generic.Dictionary`2"),
    metadataName: "System.Collections.Generic.Dictionary`2",
    typeParameters: [{ name: "TKey" }, { name: "TValue" }],
    members: [{
      kind: "method",
      sourceName: "TryGetValue",
      targetName: "TryGetValue",
      targetId: testTargetId("System.Collections.Generic.Dictionary`2.TryGetValue"),
      metadataName: "System.Collections.Generic.Dictionary`2.TryGetValue",
      signatures: [{
        id: testTargetId("System.Collections.Generic.Dictionary`2.TryGetValue(TKey,out TValue)"),
        sourceId: testTargetId("System.Collections.Generic.Dictionary`2.TryGetValue(TKey,out TValue)"),
        parameters: [{
          name: "key",
          type: { kind: "type-parameter", name: "TKey" },
          passingMode: "by-value",
        }, {
          name: "value",
          type: { kind: "type-parameter", name: "TValue" },
          passingMode: "byref-writeonly-must-init",
          attributes: [{
            id: "test:MaybeNullWhen",
            target: "parameter",
            attributeType: {
              kind: "named",
              targetId: testTargetId("System.Diagnostics.CodeAnalysis.MaybeNullWhenAttribute"),
              metadataName: "System.Diagnostics.CodeAnalysis.MaybeNullWhenAttribute",
              displayName: "System.Diagnostics.CodeAnalysis.MaybeNullWhenAttribute",
            },
            constructorId: testTargetId("System.Diagnostics.CodeAnalysis.MaybeNullWhenAttribute..ctor(System.Boolean)"),
            arguments: [{
              kind: "constructor",
              value: { kind: "source-primitive", name: "bool", value: false },
            }],
          }],
        }],
        returnType: { kind: "source-primitive", name: "bool" },
      }],
    }],
  };

  const binding = dotnetExportToTargetBinding(dictionary);
  assert.ok(binding);
  const parameter = binding.members[0].parameters[1];
  assert.equal(parameter.passingMode, "byref-writeonly-must-init");
  assert.equal(parameter.csharpOutputMayBeNull, true);
});

test(".NET target parameters do not infer output nullability from unrelated attributes", () => {
  const parameter = {
    name: "value",
    type: { kind: "string" },
    passingMode: "byref-writeonly-must-init",
    attributes: [{
      id: "test:Obsolete",
      target: "parameter",
      attributeType: {
        kind: "named",
        targetId: testTargetId("System.ObsoleteAttribute"),
        metadataName: "System.ObsoleteAttribute",
        displayName: "System.ObsoleteAttribute",
      },
      constructorId: testTargetId("System.ObsoleteAttribute..ctor()"),
    }],
  };
  const declaration = {
    kind: "type",
    typeKind: "class",
    sourceName: "Host",
    namespaceName: "Example",
    targetId: testTargetId("Example.Host"),
    metadataName: "Example.Host",
    members: [{
      kind: "method",
      sourceName: "Read",
      targetName: "Read",
      targetId: testTargetId("Example.Host.Read"),
      metadataName: "Example.Host.Read",
      signatures: [{
        id: testTargetId("Example.Host.Read(out System.String)"),
        sourceId: testTargetId("Example.Host.Read(out System.String)"),
        parameters: [parameter],
        returnType: { kind: "void" },
      }],
    }],
  };

  const binding = dotnetExportToTargetBinding(declaration);
  assert.ok(binding);
  assert.equal(binding.members[0].parameters[0].csharpOutputMayBeNull, undefined);
});
