import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dotnetModuleSpecifierForMetadataName,
  dotnetModuleSpecifierForTargetId,
} from "../../../../dist/providers/dotnet/modules/lookup.js";
import {
  dotnetNativeArrayTypeId,
} from "../../../../dist/providers/dotnet/modules/native-array.js";

test(".NET target lookup accepts only canonical .NET and explicit synthetic identities", () => {
  assert.equal(
    dotnetModuleSpecifierForTargetId(
      "Example.Assembly, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null::System.Collections.Generic.List`1",
    ),
    "@tsonic/dotnet/System.Collections.Generic.js",
  );
  assert.equal(
    dotnetModuleSpecifierForTargetId(
      "Example.Assembly::System.Environment+SpecialFolder",
    ),
    "@tsonic/dotnet/System.js",
  );
  assert.equal(
    dotnetModuleSpecifierForTargetId(dotnetNativeArrayTypeId),
    "@tsonic/dotnet/System.js",
  );
});

test(".NET target lookup rejects identities owned by source and static capability relations", () => {
  for (const targetId of [
    "tsonic.source:/project/index:Counter",
    "Tsonic.CSharp.Node.Buffer",
    "Tsonic.CSharp.Js.JsArray`1",
    "System.String",
    "",
    "::System.String",
    "Example.Assembly::",
    "Example.Assembly::System.String::extra",
  ]) {
    assert.equal(dotnetModuleSpecifierForTargetId(targetId), undefined, targetId);
  }
});

test(".NET metadata lookup is total for unowned metadata spellings", () => {
  assert.equal(
    dotnetModuleSpecifierForMetadataName("System.Collections.Generic.Dictionary`2"),
    "@tsonic/dotnet/System.Collections.Generic.js",
  );
  for (const metadataName of [
    "",
    "String",
    "tsonic.source:/project/index.Counter",
    "System..String",
  ]) {
    assert.equal(dotnetModuleSpecifierForMetadataName(metadataName), undefined, metadataName);
  }
});
