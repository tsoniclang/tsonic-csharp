import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = new URL("../..", import.meta.url).pathname;

test("C# responsibility folders replace their superseded locations", () => {
  const moves = [
    ["src/providers/native/reflection", "src/providers/native/acquisition"],
    ["src/providers/native/declarations", "src/providers/native/projection/declarations"],
    ["src/providers/native/modules", "src/providers/native/projection"],
    ["src/providers/relations", "src/providers/native/relations.ts"],
    ["src/policy/js-value-operations", "src/policy/operations/js-values"],
    ["src/policy/conversions/selection", "src/policy/conversions"],
    ["src/target-model/contracts", "src/target-model/identities"],
    ["src/target-model/declarations", "src/target-model/types"],
    ["src/backend/target-ast/roslyn", "src/backend/target-ast/syntax"],
  ];
  for (const [before, after] of moves) {
    assert.equal(existsSync(resolve(root, before)), false, before);
    assert.equal(existsSync(resolve(root, after)), true, after);
    if (statSync(resolve(root, after)).isDirectory()) {
      assert.equal(readdirSync(resolve(root, after)).length > 0, true, after);
    } else {
      assert.equal(statSync(resolve(root, after)).isFile(), true, after);
    }
  }
  for (const removed of ["src/providers/native/model/contract", "src/providers/native/model/contract.ts", "src/providers/native/projection/modules", "src/providers/native/relations", "src/providers/native/contributions.ts", "src/providers/native/diagnostics.ts", "src/providers/native/provider.ts"]) {
    assert.equal(existsSync(resolve(root, removed)), false, removed);
  }
  for (const destination of ["src/providers/native/model/normalization/index.ts", "src/providers/native/acquisition/contributions.ts", "src/providers/native/model/diagnostics.ts", "src/providers/native/projection/provider.ts", "src/providers/model/provider-relations.ts", "src/providers/native/projection/module-lookup.ts", "src/providers/native/projection/module-native-array.ts", "src/providers/native/projection/module-request.ts", "src/providers/native/projection/module-slices.ts", "src/providers/native/projection/module-specifier.ts"]) {
    assert.equal(statSync(resolve(root, destination)).isFile(), true, destination);
  }
  assert.equal(existsSync(resolve(root, "src/providers/native/acquisition/tool")), false);
  assert.equal(existsSync(resolve(root, "src/target-model/identities/identities.ts")), true);
  assert.equal(existsSync(resolve(root, "src/target-model/types/generic-constraints.ts")), true);
});

test("pure C# carrier vocabulary has one dedicated owner", () => {
  const carriers = [
    "array-like", "binding-array-carrier", "class-factories", "collection-reads",
    "collections", "delegates", "generators", "nullable", "optional-storage",
    "runtime-carriers", "scalar-types",
  ];
  for (const carrier of carriers) {
    assert.equal(existsSync(resolve(root, `src/target-model/types/${carrier}.ts`)), false, carrier);
    assert.equal(existsSync(resolve(root, `src/target-model/types/carriers/${carrier}.ts`)), true, carrier);
  }
});

test("C# responsibility tests follow their source owners", () => {
  const moves = [
    ["test/providers/native/reflection", "test/providers/native/acquisition"],
    ["test/providers/native/declarations", "test/providers/native/projection"],
    ["test/providers/relations", "test/providers/native/direct-provider-relations.test.mjs"],
    ["test/policy/js-value-present-operations.test.mjs", "test/policy/operations/js-values/js-value-present-operations.test.mjs"],
    ["test/target-model/types/argument-vector-callbacks.test.mjs", "test/target-model/types/carriers/argument-vector-callbacks.test.mjs"],
  ];
  for (const [before, after] of moves) {
    assert.equal(existsSync(resolve(root, before)), false, before);
    assert.equal(existsSync(resolve(root, after)), true, after);
  }
  for (const removed of ["test/providers/native/projection/declarations", "test/providers/native/target-bindings", "test/providers/native/source-profile", "test/providers/native/relations"]) {
    assert.equal(existsSync(resolve(root, removed)), false, removed);
  }
  for (const destination of ["test/providers/native/compilation-selection.test.mjs", "test/providers/native/direct-provider-relations.test.mjs", "test/providers/native/projection/dotnet-provider-contract.test.mjs", "test/providers/native/projection/dotnet-provider-attributes.test.mjs", "test/providers/native/projection/capability-dotnet-source-provider.test.mjs"]) {
    assert.equal(statSync(resolve(root, destination)).isFile(), true, destination);
  }
});
