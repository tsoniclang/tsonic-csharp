import assert from "node:assert/strict";
import test from "node:test";
import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

test("logical locations and native pointer shapes remain independent", () => {
  const compiled = cleanCompile(`
    import type {
      FunctionPointer,
      NativePointer,
      Pointer,
      bool,
      int32,
    } from "@tsonic/core/types.js";
    import type { fnptr, ptr } from "@tsonic/csharp/lang.js";

    export function logical(value: Pointer<int32>): Pointer<int32> {
      return value;
    }
    export function native(value: NativePointer<int32>): NativePointer<int32> {
      return value;
    }
    export function nativeAlias(value: ptr<int32>): ptr<int32> {
      return value;
    }
    export function callback(
      value: FunctionPointer<[int32], bool>,
    ): FunctionPointer<[int32], bool> {
      return value;
    }
    export function callbackAlias(
      value: fnptr<[int32], bool>,
    ): fnptr<[int32], bool> {
      return value;
    }
  `);

  const source = compiled.artifacts.get("src/Index.cs");
  assert.match(
    source,
    /public static Tsonic\.CSharp\.Runtime\.Location<int> logical\(Tsonic\.CSharp\.Runtime\.Location<int> value\)/u,
  );
  assert.match(source, /public static unsafe int\* native\(int\* value\)/u);
  assert.match(source, /public static unsafe int\* nativeAlias\(int\* value\)/u);
  assert.match(source, /public static unsafe delegate\*<int, bool> callback\(delegate\*<int, bool> value\)/u);
  assert.match(source, /public static unsafe delegate\*<int, bool> callbackAlias\(delegate\*<int, bool> value\)/u);
  assert.doesNotMatch(source, /unsafe static class Index/u);
  assert.match(compiled.artifacts.get("TsonicGenerated.csproj"), /<LangVersion>14\.0<\/LangVersion>/u);
  assert.match(compiled.artifacts.get("TsonicGenerated.csproj"), /<AllowUnsafeBlocks>true<\/AllowUnsafeBlocks>/u);
});

test("native pointer operations lower only inside an explicit unsafe block", () => {
  const compiled = cleanCompile(`
    import {
      loadNativePointer,
      offsetNativePointer,
      storeNativePointer,
      unsafeContext,
    } from "@tsonic/core/lang.js";
    import type { NativePointer, int32, nativeInt } from "@tsonic/core/types.js";

    export function copy(
      source: NativePointer<int32>,
      destination: NativePointer<int32>,
      offset: nativeInt,
    ): NativePointer<int32> {
      unsafeContext();
      storeNativePointer(destination, loadNativePointer(source));
      return offsetNativePointer(source, offset);
    }
  `);

  const source = compiled.artifacts.get("src/Index.cs");
  assert.match(
    source,
    /public static unsafe int\* copy\(int\* source, int\* destination, nint offset\)\s*\{\s*unsafe\s*\{\s*\*destination = \*source;\s*return source \+ offset;\s*\}\s*\}/u,
  );
});

test("native pointer operations fail closed outside explicit unsafe context", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { loadNativePointer } from "@tsonic/core/lang.js";
      import type { NativePointer, int32 } from "@tsonic/core/types.js";

      export function reject(pointer: NativePointer<int32>): int32 {
        return loadNativePointer(pointer);
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(
    compiled.targetDiagnostics.map(({ code, message }) => ({ code, message })),
    [{
      code: "CSHARP_NATIVE_POINTER_UNSAFE_CONTEXT_REQUIRED",
      message: "C# native-pointer 'load' requires an explicit unsafeContext()/unsafe() source region.",
    }],
  );
});

test("C# 15 preview unsafe expressions do not imply declaration safety", () => {
  const compiled = cleanCompile(`
    import { loadNativePointer, unsafeContext } from "@tsonic/core/lang.js";
    import type { NativePointer, int32 } from "@tsonic/core/types.js";

    export function read(pointer: NativePointer<int32>): int32 {
      return unsafeContext(loadNativePointer(pointer));
    }
  `, {
    targetOptions: { languageDialect: "csharp15-preview" },
  });

  const source = compiled.artifacts.get("src/Index.cs");
  assert.match(source, /public static int read\(int\* pointer\)/u);
  assert.doesNotMatch(source, /public static unsafe int read/u);
  assert.match(source, /return unsafe\(\*pointer\);/u);
  const project = compiled.artifacts.get("TsonicGenerated.csproj");
  assert.match(project, /<LangVersion>preview<\/LangVersion>/u);
  assert.match(project, /<AllowUnsafeBlocks>true<\/AllowUnsafeBlocks>/u);
});

test("C# 15 pointer existence does not imply a caller contract or unsafe project permission", () => {
  const compiled = cleanCompile(`
    import type { NativePointer, int32 } from "@tsonic/core/types.js";

    export function pass(pointer: NativePointer<int32>): NativePointer<int32> {
      return pointer;
    }
  `, {
    targetOptions: { languageDialect: "csharp15-preview" },
  });

  const source = compiled.artifacts.get("src/Index.cs");
  assert.match(source, /public static int\* pass\(int\* pointer\)/u);
  assert.doesNotMatch(source, /public static unsafe int\* pass/u);
  assert.doesNotMatch(
    compiled.artifacts.get("TsonicGenerated.csproj"),
    /<AllowUnsafeBlocks>/u,
  );
});

test("C# aliases preserve exact unsafe evidence and local shadows remain ordinary calls", () => {
  const compiled = cleanCompile(`
    import { unsafe as directUnsafe } from "@tsonic/csharp/lang.js";
    import * as csharp from "@tsonic/csharp/lang.js";
    import { loadNativePointer } from "@tsonic/core/lang.js";
    import type { ptr } from "@tsonic/csharp/lang.js";
    import type { int32 } from "@tsonic/core/types.js";

    function unsafe(value: int32): int32 { return value; }

    export function direct(pointer: ptr<int32>): int32 {
      return directUnsafe(loadNativePointer(pointer));
    }
    export function namespaced(pointer: ptr<int32>): int32 {
      return csharp.unsafe(loadNativePointer(pointer));
    }
    export function shadowed(value: int32): int32 {
      return unsafe(value);
    }
  `, {
    targetOptions: { languageDialect: "csharp15-preview" },
  });

  const source = compiled.artifacts.get("src/Index.cs");
  assert.equal(occurrences(source, "return unsafe(*pointer);"), 2);
  assert.match(source, /return @unsafe\(value\);/u);
});

test("declaration safety contracts attach only to exact selected declarations", () => {
  const compiled = cleanCompile(`
    import { safety } from "@tsonic/core/lang.js";
    import type { int32 } from "@tsonic/core/types.js";

    export function selected(value: int32): int32 { return value; }
    export function sibling(value: int32): int32 { return value; }

    export class NativeApi {
      value: int32 = 0;
      read(value: int32): int32 { return value; }
      get current(): int32 { return this.value; }
      set current(value: int32) { this.value = value; }
      get snapshot(): int32 { return this.value; }
    }

    safety(selected).requiresUnsafe();
    safety<NativeApi>().method(api => api.read).requiresUnsafe();
    safety<NativeApi>().property(api => api.value).requiresUnsafe();
    safety<NativeApi>().property(api => api.current).setter().requiresUnsafe();
    safety<NativeApi>().property(api => api.snapshot).getter().requiresUnsafe();
  `, {
    targetOptions: {
      languageDialect: "csharp15-preview",
      memorySafetyRules: "preview",
    },
  });

  const source = compiled.artifacts.get("src/Index.cs");
  assert.match(source, /public static unsafe int selected\(int value\)/u);
  assert.match(source, /public static int sibling\(int value\)/u);
  assert.match(source, /public unsafe int read\(int value\)/u);
  assert.match(source, /public unsafe int value/u);
  assert.match(source, /get\s*\{/u);
  assert.doesNotMatch(source, /(?:^|\s)safe get/u);
  assert.match(source, /unsafe set\s*\{/u);
  assert.match(source, /int snapshot\s*\{\s*unsafe get/u);
  assert.doesNotMatch(source, /safety\(/u);
  assert.doesNotMatch(source, /unsafe class NativeApi/u);
  assert.match(
    compiled.artifacts.get("TsonicGenerated.csproj"),
    /<Features>updated-memory-safety-rules<\/Features>/u,
  );
  assert.match(
    compiled.artifacts.get("TsonicGenerated.csproj"),
    /<AllowUnsafeBlocks>true<\/AllowUnsafeBlocks>/u,
  );
});

test("C# safety aliases preserve cross-file selected declaration identity", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { imported } from "./dependency.js";
      import { safety as csharpSafety } from "@tsonic/csharp/lang.js";
      import type { int32 } from "@tsonic/core/types.js";

      function safety(value: int32): int32 { return value; }
      export function local(value: int32): int32 { return safety(value); }
      csharpSafety(imported).requiresUnsafe();
    `,
    files: {
      "dependency.ts": `
        import type { int32 } from "@tsonic/core/types.js";
        export function imported(value: int32): int32 { return value; }
        export function sibling(value: int32): int32 { return value; }
      `,
    },
    targetOptions: {
      languageDialect: "csharp15-preview",
      memorySafetyRules: "preview",
    },
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.match(generated, /public static unsafe int imported\(int value\)/u);
  assert.match(generated, /public static int sibling\(int value\)/u);
  assert.match(generated, /return safety\(value\);/u);
});

test("declaration caller contracts reject dialects that cannot express them", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { safety } from "@tsonic/core/lang.js";
      import type { int32 } from "@tsonic/core/types.js";
      export function selected(value: int32): int32 { return value; }
      safety(selected).requiresUnsafe();
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(
    compiled.targetDiagnostics.map(({ code, message }) => ({ code, message })),
    [{
      code: "CSHARP_SAFETY_CONTRACT_DIALECT_UNSUPPORTED",
      message: "C# declaration caller-safety contracts require target option languageDialect='csharp15-preview'.",
    }],
  );
});

test("declaration caller contracts never create lexical unsafe permission", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { loadNativePointer, safety } from "@tsonic/core/lang.js";
      import type { NativePointer, int32 } from "@tsonic/core/types.js";

      export function read(pointer: NativePointer<int32>): int32 {
        return loadNativePointer(pointer);
      }
      safety(read).requiresUnsafe();
    `,
    targetOptions: {
      languageDialect: "csharp15-preview",
      memorySafetyRules: "preview",
    },
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(
    compiled.targetDiagnostics.map(({ code, message }) => ({ code, message })),
    [{
      code: "CSHARP_NATIVE_POINTER_UNSAFE_CONTEXT_REQUIRED",
      message: "C# native-pointer 'load' requires an explicit unsafeContext()/unsafe() source region.",
    }],
  );
});

test("bodyless members and constructors retain independent declaration safety", () => {
  const compiled = cleanCompile(`
    import { safety } from "@tsonic/core/lang.js";
    import type { int32 } from "@tsonic/core/types.js";

    export interface NativeContract {
      read(value: int32): int32;
      current: int32;
    }

    export interface NativeIndexerContract {
      [key: string]: int32;
    }

    export interface NativeIndexerAccessorContract {
      [key: string]: int32;
    }

    export class ExplicitNative {
      constructor(publicValue: int32) { this.value = publicValue; }
      value: int32 = 0;
    }

    export class ImplicitNative {
      value: int32 = 0;
    }

    safety<NativeContract>().method(value => value.read).requiresUnsafe();
    safety<NativeContract>().property(value => value.current).setter().requiresUnsafe();
    safety<NativeIndexerContract>().indexer(value => value[""]).requiresUnsafe();
    safety<NativeIndexerAccessorContract>().indexer(value => value[""]).getter().requiresUnsafe();
    safety<NativeIndexerAccessorContract>().indexer(value => value[""]).setter().requiresUnsafe();
    safety<ExplicitNative>().constructor().requiresUnsafe();
    safety<ImplicitNative>().constructor().requiresUnsafe();
  `, {
    targetOptions: {
      languageDialect: "csharp15-preview",
      memorySafetyRules: "preview",
    },
  });

  const source = compiled.artifacts.get("src/Index.cs");
  assert.match(source, /unsafe int read\(int value\);/u);
  assert.match(source, /int current \{ get; unsafe set; \}/u);
  assert.match(source, /unsafe int this\[string key\] \{ get; set; \}/u);
  assert.match(source, /int this\[string key\] \{ unsafe get; unsafe set; \}/u);
  assert.match(source, /public unsafe ExplicitNative\(int publicValue\)/u);
  assert.match(source, /public unsafe ImplicitNative\(\)/u);
});

test("accessor safety contracts fail closed when C# emits no matching accessor", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { safety } from "@tsonic/core/lang.js";
      import type { int32 } from "@tsonic/core/types.js";

      export class FieldOwner {
        value: int32 = 0;
      }

      export interface ReadonlyIndex {
        readonly [key: string]: int32;
      }

      safety<FieldOwner>().property(value => value.value).setter().requiresUnsafe();
      safety<ReadonlyIndex>().indexer(value => value[""]).setter().requiresUnsafe();
    `,
    targetOptions: {
      languageDialect: "csharp15-preview",
      memorySafetyRules: "preview",
    },
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(
    compiled.targetDiagnostics.map(({ code, message }) => ({ code, message })),
    [
      {
        code: "CSHARP_SAFETY_ACCESSOR_TARGET_NOT_EMITTED",
        message: "The selected source setter has no corresponding emitted C# accessor for its explicit safety contract.",
      },
      {
        code: "CSHARP_SAFETY_ACCESSOR_TARGET_NOT_EMITTED",
        message: "The selected source setter has no corresponding emitted C# accessor for its explicit safety contract.",
      },
    ],
  );
});

test("preview syntax does not implicitly opt into updated memory-safety rules", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { safety } from "@tsonic/core/lang.js";
      import type { int32 } from "@tsonic/core/types.js";
      export function selected(value: int32): int32 { return value; }
      safety(selected).requiresUnsafe();
    `,
    targetOptions: { languageDialect: "csharp15-preview" },
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(
    compiled.targetDiagnostics.map(({ code, message }) => ({ code, message })),
    [{
      code: "CSHARP_SAFETY_CONTRACT_RULES_UNSUPPORTED",
      message: "C# declaration caller-safety contracts require target option memorySafetyRules='preview'; selecting preview syntax alone does not opt the assembly into updated memory-safety rules.",
    }],
  );
});

test("ordinary declarations reject the target-specific safe modifier", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { safety } from "@tsonic/core/lang.js";
      import type { int32 } from "@tsonic/core/types.js";
      export function selected(value: int32): int32 { return value; }
      safety(selected).safe();
    `,
    targetOptions: {
      languageDialect: "csharp15-preview",
      memorySafetyRules: "preview",
    },
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(
    compiled.targetDiagnostics.map(({ code, message }) => ({ code, message })),
    [{
      code: "CSHARP_SAFE_DECLARATION_TARGET_UNSUPPORTED",
      message: "C# 'safe' is only legal on target declarations that require an explicit safe-or-unsafe choice; current Tsonic source declarations do not represent such a boundary.",
    }],
  );
});

test("conflicting declaration safety contracts fail closed once", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { safety } from "@tsonic/core/lang.js";
      import type { int32 } from "@tsonic/core/types.js";
      export function selected(value: int32): int32 { return value; }
      safety(selected).safe();
      safety(selected).requiresUnsafe();
    `,
    targetOptions: {
      languageDialect: "csharp15-preview",
      memorySafetyRules: "preview",
    },
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(
    compiled.targetDiagnostics.map(({ code, message }) => ({ code, message })),
    [{
      code: "CSHARP_SAFETY_CONTRACT_CONFLICT",
      message: "One exact C# declaration received conflicting finalized safe and requires-unsafe contracts.",
    }],
  );
});

test("unsafe expression syntax rejects the stable C# dialect", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { loadNativePointer, unsafeContext } from "@tsonic/core/lang.js";
      import type { NativePointer, int32 } from "@tsonic/core/types.js";
      export function read(pointer: NativePointer<int32>): int32 {
        return unsafeContext(loadNativePointer(pointer));
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(
    compiled.targetDiagnostics.map(({ code, message }) => ({ code, message })),
    [{
      code: "CSHARP_UNSAFE_EXPRESSION_DIALECT_UNSUPPORTED",
      message: "C# unsafe expressions require target option languageDialect='csharp15-preview'.",
    }],
  );
});

function cleanCompile(sourceText, options = {}) {
  const compiled = compileCsharpSource({ ...options, sourceText });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  return compiled;
}

function occurrences(text, fragment) {
  assert.equal(typeof text, "string");
  return text.split(fragment).length - 1;
}
