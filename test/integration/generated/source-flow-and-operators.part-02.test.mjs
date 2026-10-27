import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { createTsonicPlugin as nodejsCapability } from "../../../../csharp-nodejs/dist/index.js";
import { structuralMethodRestSource, receiverBoundMethodRestSource } from "../../../../tsonic/test/fixtures/structural-method-rest.mjs";
import { compoundIndexedWriteSource } from "../../../../tsonic/test/fixtures/compound-indexed-write.mjs";
import { bigintOperatorSource } from "../../../../tsonic/test/fixtures/bigint-operators.mjs";
import { jsNumericPropertySource } from "../../../../tsonic/test/fixtures/js-numeric-properties.mjs";
import { flowClassReadSource } from "../../../../tsonic/test/fixtures/flow-class-reads.mjs";
import { referenceDefaultSource } from "../../../../tsonic/test/fixtures/reference-defaults.mjs";
import { structuralEnumerationSource } from "../../../../tsonic/test/fixtures/structural-enumeration.mjs";
import { nativeNodeSpawnSource, incompatibleNodeStdioSource } from "../../../../tsonic/test/fixtures/native-node-spawn.mjs";
import { nullishMemberStorageSource } from "../../../../tsonic/test/fixtures/nullish-member-storage.mjs";
import { contextualClassArgumentsSource } from "../../../../tsonic/test/fixtures/contextual-class-arguments.mjs";
import { classUnionUpcastSource, anonymousClassUnionUpcastSource } from "../../../../tsonic/test/fixtures/class-union-upcasts.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of Array.from([undefined, "js"]).slice(0, 1)) {
if (surface === "js") {}

test(`structural enumeration retains actual keys without reading getters (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: structuralEnumerationSource });
    executeCsharpConstruction(compiled, `structural-enumeration-${surface ?? "native"}`);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.match(output, /ReadOnlySpan<string>/);
    assert.match(output, /private static readonly string\[\] __tsonicObjectEnumerableKeyStorage/);
    assert.doesNotMatch(output, /GetProperties|GetFields|System\.Reflection/);
  });

test(`reference defaults remain lazy for methods and delegates (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: referenceDefaultSource }), `reference-defaults-${surface ?? "native"}`);
  });

test(`class flow reads preserve declaration storage and selected members (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: flowClassReadSource }), `flow-class-reads-${surface ?? "native"}`);
  });
}

for (const surface of Array.from([undefined, "js"]).slice(1, 2)) {
for (const [name, sourceText] of Array.from([["generic", classUnionUpcastSource], ["anonymous", anonymousClassUnionUpcastSource]]).slice(0, 2)) {
test(`class union upcasts preserve ${name} base identity (${surface ?? "native"})`, { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText });
      executeCsharpConstruction(compiled, `class-union-upcasts-${surface ?? "native"}`);
      const output = [...compiled.artifacts.values()].join("\n");
      assert.match(output, /\.AsReference</);
      assert.doesNotMatch(output, /\.Match</);
    });
}

if (surface === "js") test("contextual class arguments preserve branch identity", { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: contextualClassArgumentsSource }),
      `contextual-class-arguments-${surface ?? "native"}`);
  });

test(`required nullish members retain exact storage (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: nullishMemberStorageSource });
    executeCsharpConstruction(compiled, `nullish-member-storage-${surface ?? "native"}`);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.match(output, /this\.value = default\(object\?\);/);
    assert.match(output, /this\.missing = default\(object\?\);/);
    assert.doesNotMatch(output, /Runtime\.(?:Null|Undefined)/);
    assert.doesNotMatch(output, /ApplyDynamicBinaryBoolean/);
  });

test(`structural enumeration retains actual keys without reading getters (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: structuralEnumerationSource });
    executeCsharpConstruction(compiled, `structural-enumeration-${surface ?? "native"}`);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.match(output, /ReadOnlySpan<string>/);
    assert.match(output, /private static readonly string\[\] __tsonicObjectEnumerableKeyStorage/);
    assert.doesNotMatch(output, /GetProperties|GetFields|System\.Reflection/);
  });

test(`reference defaults remain lazy for methods and delegates (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: referenceDefaultSource }), `reference-defaults-${surface ?? "native"}`);
  });

test(`class flow reads preserve declaration storage and selected members (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: flowClassReadSource }), `flow-class-reads-${surface ?? "native"}`);
  });
}

test("BigInt operators retain exact counts, source errors and compound evaluation order", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: bigintOperatorSource }), "bigint-operators");
});

test("JS numeric array properties retain keys, aliases, presence and length", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: jsNumericPropertySource }), "js-numeric-properties");
});

test("JS indexed compound writes preserve evaluation order and exact result carriers", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: compoundIndexedWriteSource }), "compound-indexed-write");
});

test("object rest retains stored method values through reordered structural interfaces", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: structuralMethodRestSource }), "structural-method-rest");
});

test("object rest never binds a copied method to its original receiver", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: receiverBoundMethodRestSource });
  assert.equal(compiled.artifacts.size, 0);
  assert.ok(compiled.result.diagnostics.some(({ code, message }) =>
    code === "CSHARP_UNSUPPORTED_AST" && message.includes("copied method-value contract")));
});
