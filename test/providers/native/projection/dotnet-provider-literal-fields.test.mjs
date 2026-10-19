import { resolvedNativeBinding } from "../../../fixtures/dotnet-provider/native-inheritance.helpers.mjs";
import assert from "node:assert/strict";
import test from "node:test";

import { validateDotnetModuleModelContract } from "../../../../dist/providers/native/index.js";
import { createDotnetReflectionTypeDataProvider } from "../../../helpers/dotnet-reflection-provider.mjs";
import { getCompleteDotnetModule } from "../../../fixtures/dotnet-provider/dotnet-provider.helpers.mjs";

function reflectedType(provider, moduleSpecifier, metadataName) {
  const module = getCompleteDotnetModule(provider, moduleSpecifier, {});
  assert.equal("exports" in module, true, metadataName);
  assert.equal(validateDotnetModuleModelContract(module) === undefined, true, `${metadataName} raw contract`);
  const declaration = [...module.exports, ...(module.targetOnlyTypes ?? [])]
    .find(candidate => candidate.kind === "type" && candidate.metadataName === metadataName);
  assert.ok(declaration, metadataName);
  return declaration;
}

function reflectedField(provider, moduleSpecifier, metadataName, targetName) {
  const declaration = reflectedType(provider, moduleSpecifier, metadataName);
  const raw = declaration.members.filter(member => member.kind === "field" && member.targetName === targetName);
  assert.equal(raw.length, 1, `${metadataName}.${targetName}`);
  const binding = resolvedNativeBinding(provider.findTargetBindingByTargetId(declaration.targetId, "ordinary"));
  assert.ok(binding, declaration.targetId);
  const bound = binding.members.filter(member => member.kind === "field" && member.targetName === targetName);
  assert.equal(bound.length, 1, `${metadataName}.${targetName} binding`);
  assert.equal(bound[0].id, raw[0].targetId);
  return { raw: raw[0], bound: bound[0] };
}

const literalFields = [
  ["@tsonic/dotnet/System.js", "System.Math", "PI"],
  ["@tsonic/dotnet/System.js", "System.Int32", "MaxValue"],
  ["@tsonic/dotnet/System.js", "System.Int64", "MaxValue"],
  ["@tsonic/dotnet/System.js", "System.UInt64", "MaxValue"],
  ["@tsonic/dotnet/System.js", "System.Double", "NaN"],
  ["@tsonic/dotnet/System.js", "System.AttributeTargets", "Class"],
  ["@tsonic/dotnet/System.Diagnostics.js", "System.Diagnostics.DebuggerBrowsableState", "Never"],
];

test(".NET reflection marks literal fields from FieldInfo.IsLiteral and projects them once as csharpLiteral", () => {
  const provider = createDotnetReflectionTypeDataProvider({});
  for (const [moduleSpecifier, metadataName, targetName] of literalFields) {
    const { raw, bound } = reflectedField(provider, moduleSpecifier, metadataName, targetName);
    assert.equal(raw.literal, true, `${metadataName}.${targetName}`);
    assert.equal(raw.static, true);
    assert.equal(raw.writable, undefined);
    assert.equal(bound.csharpLiteral, true);
    assert.equal(bound.static, true);
    assert.equal(bound.readonly, true);
    for (const key of ["value", "constantValue", "literalValue"]) {
      assert.equal(key in raw, false, `${metadataName}.${targetName} raw ${key}`);
      assert.equal(key in bound, false, `${metadataName}.${targetName} bound ${key}`);
    }
  }
  const { raw: int64 } = reflectedField(provider, "@tsonic/dotnet/System.js", "System.Int64", "MaxValue");
  const { raw: uint64 } = reflectedField(provider, "@tsonic/dotnet/System.js", "System.UInt64", "MaxValue");
  assert.equal(JSON.stringify(int64).includes("9223372036854775807"), false);
  assert.equal(JSON.stringify(uint64).includes("18446744073709551615"), false);
});

test(".NET static readonly fields are not literal fields", () => {
  const provider = createDotnetReflectionTypeDataProvider({});
  for (const [metadataName, targetName] of [["System.String", "Empty"], ["System.Guid", "Empty"], ["System.IntPtr", "Zero"]]) {
    const { raw, bound } = reflectedField(provider, "@tsonic/dotnet/System.js", metadataName, targetName);
    assert.equal(raw.static, true, `${metadataName}.${targetName}`);
    assert.equal(raw.writable, undefined);
    assert.equal("literal" in raw, false, `${metadataName}.${targetName}`);
    assert.equal(bound.readonly, true);
    assert.equal("csharpLiteral" in bound, false, `${metadataName}.${targetName}`);
  }
});
