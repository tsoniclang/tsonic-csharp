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

  const systemModule = provider.getModule("@tsonic/dotnet/System.js", {});
  assert.equal("exports" in systemModule, true);
  assert.equal(systemModule.exports.some((declaration) => declaration.sourceName === "SpecialFolder"), false);
  assert.ok(systemModule.targetOnlyTypes?.some((declaration) => declaration.metadataName === "System.Environment.SpecialFolder"));
});

test(".NET reflection provider exposes delegates with source shells and target delegate identity", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const systemModule = provider.getModule("@tsonic/dotnet/System.js", {});
  assert.equal("exports" in systemModule, true);
  const declarationModel = dotnetModuleToProviderDeclarationModel(systemModule);
  const predicate = declarationModel.exports.find((declaration) => declaration.name === "Predicate");
  assert.ok(predicate);
  assert.equal(predicate.kind, "class");
  assert.deepEqual(predicate.typeParameters?.map((parameter) => parameter.name), ["T"]);
  assert.equal(predicate.type?.kind, "function");
  assert.deepEqual(predicate.type?.kind === "function"
    ? predicate.type.parameters.map((parameter) => [parameter.name, parameter.type])
    : [], [["obj", { kind: "type-parameter", name: "T" }]]);
  assert.deepEqual(predicate.type?.kind === "function" ? predicate.type.returnType : undefined, {
    kind: "source-primitive",
    name: "bool",
  });

  const targetBinding = provider.findTargetBindingByTargetId("System.Predicate`1");
  assert.equal(targetBinding?.kind, "delegate");
  assert.equal(targetBinding?.csharpType.kind, "target-named");
  assert.equal(targetBinding?.csharpType.kind === "target-named" ? targetBinding.csharpType.id : undefined, "System.Predicate`1");
});

test(".NET reflection provider classifies unsupported type families without silently dropping them", () => {
  const provider = createDotnetReflectionTypeDataProvider();
  const systemModule = provider.getModule("@tsonic/dotnet/System.js", {});
  assert.equal("exports" in systemModule, true);

  const unsupportedFamilies = new Map(systemModule.unsupportedExports?.map((declaration) => [declaration.sourceName, declaration]) ?? []);
  const action = unsupportedFamilies.get("Action");
  const func = unsupportedFamilies.get("Func");

  assert.ok(action);
  assert.equal(action.kind, "unsupported-type-family");
  assert.ok(action.metadataNames.includes("System.Action"));
  assert.ok(action.metadataNames.includes("System.Action`1"));
  assert.match(action.reason, /provider type-family declaration model/);

  assert.ok(func);
  assert.equal(func.kind, "unsupported-type-family");
  assert.ok(func.metadataNames.includes("System.Func`1"));
  assert.ok(func.metadataNames.includes("System.Func`2"));
  assert.match(func.reason, /provider type-family declaration model/);

  const specialFolder = systemModule.unsupportedExports?.find((declaration) =>
    declaration.kind === "unsupported-nested-type" &&
    declaration.metadataName === "System.Environment.SpecialFolder"
  );
  assert.ok(specialFolder);
  assert.equal(specialFolder.sourceName, "SpecialFolder");
  assert.equal(specialFolder.declaringMetadataName, "System.Environment");
  assert.match(specialFolder.reason, /nested-type declaration model/);

  assert.ok(systemModule.targetOnlyTypes?.some((declaration) => declaration.metadataName === "System.Action`1"));
  assert.ok(systemModule.targetOnlyTypes?.some((declaration) => declaration.metadataName === "System.Func`2"));
  assert.ok(systemModule.targetOnlyTypes?.some((declaration) => declaration.metadataName === "System.Environment.SpecialFolder"));

  assert.equal(provider.findTargetBindingByTargetId("System.Action`1")?.kind, "delegate");
  assert.equal(provider.findTargetBindingByTargetId("System.Func`2")?.kind, "delegate");
});
