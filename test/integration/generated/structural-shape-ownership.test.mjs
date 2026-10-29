import assert from "node:assert/strict";
import test from "node:test";
import { createTsonicPlugin as nodejsCapability } from "../../../../csharp-nodejs/dist/index.js";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const nativeReadonlyViews = [
  ["direct readonly", "Readonly<RawPointer>", ""],
  ["local readonly alias", "View", "type View = Readonly<RawPointer>;"],
  ["renamed foreign alias", "Readonly<Foreign>", "type Foreign = RawPointer;"],
];
const foreignViews = [
  ["direct pick", "Pick<RawPointer, keyof RawPointer>", ""],
  ["local picked alias", "View", "type View = Pick<RawPointer, keyof RawPointer>;"],
  ["custom mapped type", "View<RawPointer>", "type View<Value> = { readonly [Key in keyof Value]: Value[Key] };"],
  ["mixed project and foreign origins", "View", "type View = Readonly<RawPointer & { local: string }>;"],
];

for (const surface of [undefined, "js"]) {
  for (const [name, type, declarations] of nativeReadonlyViews) {
    test(`canonical readonly preserves native pointer identity for ${name} (${surface ?? "native"})`, { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `
        import type { RawPointer } from "@tsonic/core/types.js";
        ${declarations}
        export function pass(value: ${type}): ${type} { return value; }
      ` });
      assertCsharpCheckingSucceeded(compiled);
      assertCsharpCompilationSucceeded(compiled);
      assert.equal(compiled.result.program !== undefined, true, "the checked native view reaches the sealed program");
      const output = [...compiled.artifacts.values()].join("\n");
      assert.match(output,
        /public static ((?:global::)?Tsonic\.CSharp\.Runtime\.RawPointer\??) pass\(\1 value\)/u,
        "the original parameter and result retain the same actual native pointer carrier");
      assert.doesNotMatch(output, /__tsonicSourceType|ObjectShape_|System\.Reflection|\b(?:class|record) RawPointer\b/u,
        "readonly does not materialize marker fields, a pointer wrapper or reflection");
      const native = executeCsharpConstruction(compiled, `readonly-opaque-${name.replaceAll(" ", "-")}-${surface ?? "native"}`,
        false, false, [], `
        using System;
        using Tsonic.CSharp.Runtime;
        const ulong address = 0x1234;
        var width = IntPtr.Size * 8;
        var input = RawPointer.FromAddress(address, width) ?? throw new Exception("nonzero native pointer");
        var result = Tsonic.Generated.Index.pass(input);
        if (!Object.ReferenceEquals(input, result) || RawPointer.Address(result, width) != address)
          throw new Exception("readonly preserves the original native pointer and address");
        RawPointer? handwritten = input;
        for (var index = 0; index < 40000; index++) {
          result = Tsonic.Generated.Index.pass(input);
          handwritten = NativeIdentity(input);
        }
        var beforeNative = GC.GetAllocatedBytesForCurrentThread();
        for (var index = 0; index < 40000; index++) handwritten = NativeIdentity(input);
        var nativeBytes = GC.GetAllocatedBytesForCurrentThread() - beforeNative;
        var beforeGenerated = GC.GetAllocatedBytesForCurrentThread();
        for (var index = 0; index < 40000; index++) result = Tsonic.Generated.Index.pass(input);
        var generatedBytes = GC.GetAllocatedBytesForCurrentThread() - beforeGenerated;
        if (!Object.ReferenceEquals(input, result) || !Object.ReferenceEquals(input, handwritten) ||
            RawPointer.Address(result, width) != address || generatedBytes != nativeBytes || nativeBytes != 0)
          throw new Exception($"native identity or allocation: native={nativeBytes},generated={generatedBytes}");
        GC.KeepAlive(input);
        GC.KeepAlive(result);
        GC.KeepAlive(handwritten);
        Console.WriteLine($"nativeBytes={nativeBytes};generatedBytes={generatedBytes};address={RawPointer.Address(result, width)}");
        static RawPointer? NativeIdentity(RawPointer? value) => value;
      `);
      assert.equal(native.trim(), "nativeBytes=0;generatedBytes=0;address=4660",
        "the original native pointer survives the real pass with no extra allocation or dereference");
    });
  }

  for (const [name, type, declarations] of foreignViews) {
    test(`unrepresented foreign fields reject ${name} (${surface ?? "native"})`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `
        import type { RawPointer } from "@tsonic/core/types.js";
        ${declarations}
        export function pass(value: ${type}): ${type} { return value; }
      ` });
      assertCsharpCheckingSucceeded(compiled);
      assert.equal(compiled.targetDiagnostics.length > 0, true, "missing native field ownership rejects");
      assert.equal(compiled.targetDiagnostics.every(diagnostic => diagnostic.code === "CSHARP_UNSUPPORTED_AST"),
        true, "the existing unsupported-shape boundary remains authoritative");
      assert.equal(compiled.artifacts.size, 0, "no executable or synthetic marker-field output is published");
    });
  }

  test(`cross-file transformed opaque declarations reject (${surface ?? "native"})`, () => {
    const compiled = compileCsharpSource({ surface, files: {
      "foreign-view.ts": `import type { RawPointer } from "@tsonic/core/types.js";
        export type View<Value> = { readonly [Key in keyof Value]: Value[Key] };
        export type AddressView = View<RawPointer>;`,
    }, sourceText: `
      import type { AddressView as Selected } from "./foreign-view.js";
      export function pass(value: Selected): Selected { return value; }
    ` });
    assertCsharpCheckingSucceeded(compiled);
    assert.equal(compiled.targetDiagnostics.length > 0, true, "an imported project alias cannot own foreign fields");
    assert.equal(compiled.artifacts.size, 0, "cross-file failure remains atomic");
  });

}

test("native provider utility projections retain represented foreign member declarations", () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: `
    import type { Stats } from "node:fs";
    type Selected = Readonly<Pick<Stats, "size">>;
    export function read(value: Selected): number { return value.size; }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.match(output, /return value\.size;/u);
  assert.doesNotMatch(output, /__tsonicSourceType|System\.Reflection/u);
});
