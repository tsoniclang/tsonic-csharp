import assert from "node:assert/strict";
import test from "node:test";

import {
  createDotnetReflectionTypeDataProvider,
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
  assert.deepEqual(dotnetTypeRefToTargetTypeRef({ kind: "object" }), {
    kind: "target-named",
    id: "System.Object",
    csharpRender: { kind: "predefined", name: "object" },
  });
});

test(".NET target binding uses provider-owned target member names", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const binding = provider.findTargetBindingByTargetId("System.Collections.Generic.List`1");
  assert.ok(binding);

  const count = binding.members.find((member) => member.sourceName === "count");
  const item = binding.members.find((member) => member.sourceName === "item");

  assert.equal(count?.targetName, "Count");
  assert.equal(item?.targetName, "Item");
});

test(".NET reflection provider exposes contracts, operators, and nested public types", () => {
  const provider = createDotnetReflectionTypeDataProvider();

  const int32 = provider.findTargetBindingByTargetId("System.Int32");
  assert.ok(int32);
  assert.ok(int32.implementedContracts.some((contract) =>
    contract.kind === "implements" &&
    contract.contract === "System.IEquatable`1" &&
    contract.typeArguments?.[0]?.kind === "source-primitive" &&
    contract.typeArguments[0].name === "int32"
  ));

  const dateTime = provider.findTargetBindingByTargetId("System.DateTime");
  assert.ok(dateTime);
  assert.ok(dateTime.members.some((member) =>
    member.kind === "operator" &&
    member.sourceName === "addition" &&
    member.targetName === "op_Addition"
  ));

  const specialFolder = provider.findTargetBindingByTargetId("System.Environment.SpecialFolder");
  assert.ok(specialFolder);
  assert.equal(specialFolder.kind, "enum");
  assert.ok(specialFolder.members.some((member) =>
    member.kind === "field" &&
    member.static === true &&
    member.sourceName === "desktop" &&
    member.targetName === "Desktop"
  ));
});
