import assert from "node:assert/strict";
import test from "node:test";

import {
  dotnetExportToTargetBinding,
} from "../dist/providers/dotnet/model.js";

test(".NET target policy projects only exact JsonSerializer.Deserialize result type parameters", () => {
  const binding = dotnetExportToTargetBinding({
    kind: "type",
    typeKind: "class",
    sourceName: "JsonSerializer",
    namespaceName: "System.Text.Json",
    targetId: "System.Text.Json.JsonSerializer",
    metadataName: "System.Text.Json.JsonSerializer",
    members: [
      deserializeMember({
        id: "exact",
        metadataName: "System.Text.Json.JsonSerializer.Deserialize",
        returnType: {
          kind: "nullable-reference",
          elementType: { kind: "type-parameter", name: "TValue" },
        },
      }),
      deserializeMember({
        id: "different-owner",
        metadataName: "Example.JsonSerializer.Deserialize",
        returnType: { kind: "type-parameter", name: "TValue" },
      }),
      deserializeMember({
        id: "different-result",
        metadataName: "System.Text.Json.JsonSerializer.Deserialize",
        returnType: { kind: "string" },
      }),
      {
        ...deserializeMember({
          id: "instance",
          metadataName: "System.Text.Json.JsonSerializer.Deserialize",
          returnType: { kind: "type-parameter", name: "TValue" },
        }),
        static: false,
      },
    ],
  });

  assert.ok(binding);
  const members = new Map(binding.members.map((member) => [member.id, member]));
  assert.deepEqual(
    members.get("exact")?.csharpMethodTypeArgumentProjections,
    [{
      kind: "project-constructible-object-shape",
      targetTypeParameterIndex: 0,
    }],
  );
  assert.equal(
    members.get("different-owner")?.csharpMethodTypeArgumentProjections,
    undefined,
  );
  assert.equal(
    members.get("different-result")?.csharpMethodTypeArgumentProjections,
    undefined,
  );
  assert.equal(
    members.get("instance")?.csharpMethodTypeArgumentProjections,
    undefined,
  );
});

function deserializeMember({ id, metadataName, returnType }) {
  return {
    kind: "method",
    sourceName: "Deserialize",
    targetName: "Deserialize",
    targetId: id,
    metadataName,
    static: true,
    signatures: [{
      id,
      sourceId: id,
      typeParameters: [{ name: "TValue" }],
      parameters: [{
        name: "json",
        type: { kind: "string" },
        passingMode: "by-value",
      }],
      returnType,
    }],
  };
}
