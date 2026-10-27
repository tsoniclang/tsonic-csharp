import assert from "node:assert/strict";
import test from "node:test";
import { createDotnetReflectionTypeDataProvider } from "../../../helpers/dotnet-reflection-provider.mjs";
import { buildConversionFixture, getCompleteDotnetModule } from "../../../fixtures/dotnet-provider/dotnet-provider.helpers.mjs";
import { createDotnetTargetBindingIndex } from "../../../../dist/providers/native/acquisition/target-binding-index.js";

test("native conversion identities retain distinct result-only overloads through repeated acquisition", () => {
  const provider = createDotnetReflectionTypeDataProvider({
    references: [buildConversionFixture()], disablePersistentCache: true,
  });
  const moduleSpecifier = "@tsonic/dotnet/ProviderConversionFixtures.js";
  const module = getCompleteDotnetModule(provider, moduleSpecifier);
  assert.equal("exports" in module, true, "complete conversion fixture acquired");
  const declaration = module.exports.find(entry => entry.kind === "type" && entry.sourceName === "ReturnSelectedConversion");
  assert.equal(declaration !== undefined, true, "actual native result-overloaded conversion owner");
  assert.equal(declaration.conversionOperators.length, 3, "all native explicit conversions retained");
  assert.equal(new Set(declaration.conversionOperators.map(operator => operator.id)).size, 3,
    "same declaring type, operator name and parameter require distinct result identities");
  assert.deepEqual(declaration.conversionOperators.map(operator => operator.targetType.name).sort(),
    ["int32", "int64", "uint64"], "all exact native result carriers");
  for (const operator of declaration.conversionOperators) {
    assert.equal(operator.conversionKind, "explicit", "native conversion kind");
    assert.equal(operator.sourceType.targetId, declaration.targetId, "same physical native operand");
  }
  const reversed = { ...module, exports: module.exports.map(entry => entry === declaration
    ? { ...entry, conversionOperators: [...entry.conversionOperators].reverse() } : entry) };
  const expected = declaration.conversionOperators.map(operator => operator.id).sort();
  for (const modules of [[module, reversed, module], [reversed, module, reversed]]) {
    const index = createDotnetTargetBindingIndex();
    for (const current of modules) {
      assert.equal(index.rememberModule(current, { moduleSpecifier, materialization: { kind: "complete" } }), undefined,
        "complete physical owner admitted without conflicting native facts");
      const selected = index.getByTargetId(declaration.targetId);
      assert.equal(selected !== undefined, true, "complete physical binding published");
      assert.deepEqual(selected.conversionOperators.map(operator => operator.id).sort(), expected,
        "result-only overloads survive every order and repeated module merge");
      assert.deepEqual(selected.conversionOperators.map(operator => operator.targetType.name).sort(),
        ["int32", "int64", "uint64"], "exact target carriers survive binding projection and merge");
    }
  }
});

test("actual BigInteger metadata preserves each explicit native integer result after module merge", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const moduleSpecifier = "@tsonic/dotnet/System.Numerics.js";
  const module = getCompleteDotnetModule(provider, moduleSpecifier, {
    requestedMetadataNames: ["System.Numerics.BigInteger"],
  });
  assert.equal("exports" in module, true, "actual native BigInteger metadata acquired");
  const declaration = [...module.exports, ...(module.targetOnlyTypes ?? [])]
    .find(entry => entry.kind === "type" && entry.metadataName === "System.Numerics.BigInteger");
  assert.equal(declaration !== undefined, true, "actual physical native BigInteger owner");
  const index = createDotnetTargetBindingIndex();
  for (const current of [module, module]) {
    assert.equal(index.rememberModule(current, { moduleSpecifier, materialization: { kind: "complete" } }), undefined,
      "repeated actual native module admission");
    const selected = index.getByTargetId(declaration.targetId);
    assert.equal(selected !== undefined, true, "actual BigInteger binding published");
    const operators = selected.conversionOperators.filter(operator => operator.conversionKind === "explicit" &&
      operator.sourceType.kind === "target-named" && operator.sourceType.id === declaration.targetId);
    for (const name of ["int32", "int64", "uint64"]) {
      assert.equal(operators.filter(operator => operator.targetType.kind === "source-primitive" && operator.targetType.name === name).length,
        1, `exactly one actual BigInteger explicit native ${name} result`);
    }
    assert.equal(new Set(operators.map(operator => operator.id)).size, operators.length,
      "physical native result overloads never collapse to one parameter-only identity");
  }
});
