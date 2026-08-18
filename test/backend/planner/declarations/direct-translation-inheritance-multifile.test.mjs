import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";

test("direct C# translation preserves exact project heritage across source modules", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { Base, Derived } from "./models.js";
      export function consume(value: Base<string>): void {}
      export function run(): void { consume(new Derived()); }
    `,
    files: {
      "models.ts": `
        export class Base<T> {}
        export class Middle<T> extends Base<T> {}
        export class Derived extends Middle<string> {}
      `,
    },
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.equal(compiled.artifacts.get("src/Models.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Models
    {
        private static readonly System.Lazy<object?> __tsonic_module_initialization = new System.Lazy<object?>(() => __tsonic_module_init_core());
        private static object? __tsonic_module_init_core()
        {
            return null;
        }
        public static void __tsonic_module_init()
        {
            _ = __tsonic_module_initialization.Value;
        }
    }
    public class Base<T>
    {
    }
    public class Middle<T> : Base<T>
    {
        public Middle() : base()
        {
        }
    }
    public class Derived : Middle<string>
    {
        public Derived() : base()
        {
        }
    }
}
`);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static void consume(Base<string> value)
        {
        }
        public static void run()
        {
            consume(new Derived());
        }
        private static readonly System.Lazy<object?> __tsonic_module_initialization = new System.Lazy<object?>(() => __tsonic_module_init_core());
        private static object? __tsonic_module_init_core()
        {
            Models.__tsonic_module_init();
            return null;
        }
        public static void __tsonic_module_init()
        {
            _ = __tsonic_module_initialization.Value;
        }
    }
}
`);
});

test("source callable contracts close imported generic calls independent of caller-first discovery", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      import { identity } from "./z-library.js";
      export function run(value: int): int { return identity<int>(value); }
    `,
    files: {
      "z-library.ts": `
        export function identity<T>(value: T): T { return value; }
      `,
    },
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.equal(compiled.artifacts.get("src/ZLibrary.cs"), `using System;

namespace Tsonic.Generated
{
    public static class ZLibrary
    {
        public static T identity<T>(T value)
        {
            return value;
        }
        private static readonly System.Lazy<object?> __tsonic_module_initialization = new System.Lazy<object?>(() => __tsonic_module_init_core());
        private static object? __tsonic_module_init_core()
        {
            return null;
        }
        public static void __tsonic_module_init()
        {
            _ = __tsonic_module_initialization.Value;
        }
    }
}
`);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static int run(int value)
        {
            return ZLibrary.identity<int>(value);
        }
        private static readonly System.Lazy<object?> __tsonic_module_initialization = new System.Lazy<object?>(() => __tsonic_module_init_core());
        private static object? __tsonic_module_init_core()
        {
            ZLibrary.__tsonic_module_init();
            return null;
        }
        public static void __tsonic_module_init()
        {
            _ = __tsonic_module_initialization.Value;
        }
    }
}
`);
});
