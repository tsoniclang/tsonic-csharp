import assert from "node:assert/strict";
import test from "node:test";
import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

test("direct C# declaration translation preserves generic constraints, static state, accessors, and optional storage", () => {
  const compiled = cleanCompile(`
    import type { int } from "@tsonic/csharp/types.js";

    export interface Named {
      name: string;
    }

    export class Box<T extends Named> {
      static count: int = 0;
      value: T;
      note?: string;

      constructor(value: T) {
        this.value = value;
        Box.count++;
      }

      get Value(): T {
        return this.value;
      }

      set Value(next: T) {
        this.value = next;
      }

      read<U extends Named>(fallback: U): U {
        return fallback;
      }
    }

    export function identity<T>(value: T): T {
      return value;
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static T identity<T>(T value)
        {
            return value;
        }
    }
    public interface Named
    {
        string name { get; set; }
    }
    public class Box<T>
    where T : Named
    {
        public static int count = 0;
        public T value;
        public string? note;
        public Box(T value)
        {
            this.value = value;
            Box.count++;
        }
        public T Value
        {
            get
            {
                return this.value;
            }
            set
            {
                T next = value;
                this.value = next;
            }
        }
        public U read<U>(U fallback)
        where U : Named
        {
            return fallback;
        }
    }
}
`);
});

test("static class fields require explicit source initialization semantics", () => {
  const rejected = compileCsharpSource({
    sourceText: `
      import type { int32 } from "@tsonic/core/types.js";
      export class Counter {
        static total: int32;
      }
    `,
  });

  assert.equal(rejected.sourceDiagnosticsText, "");
  assert.deepEqual(rejected.extensionDiagnostics, []);
  assert.deepEqual(rejected.targetDiagnostics.map(({ code }) => code), [
    "CSHARP_STATIC_FIELD_INITIALIZER_REQUIRED",
  ]);

  const explicitDefault = cleanCompile(`
    import { defaultValue } from "@tsonic/core/lang.js";
    import type { int32 } from "@tsonic/core/types.js";
    export class Counter {
      static total: int32 = defaultValue<int32>();
    }
  `);

  assert.match(
    explicitDefault.artifacts.get("src/Index.cs"),
    /public static int total = default\(int\)!;/u,
  );
});

test("direct C# declaration translation separates typed locations from native pointers and function pointers", () => {
  const compiled = cleanCompile(`
    import type { fnptr, ptr } from "@tsonic/csharp/lang.js";
    import type { bool, FunctionPointer, int32, Pointer } from "@tsonic/core/types.js";

    export function neutralAddress(value: Pointer<int32>): Pointer<int32> {
      return value;
    }

    export function aliasAddress(value: ptr<int32>): ptr<int32> {
      return value;
    }

    export function neutralCallback(
      value: FunctionPointer<[int32, int32], bool>,
    ): FunctionPointer<[int32, int32], bool> {
      return value;
    }

    export function aliasCallback(
      value: fnptr<[int32, int32], bool>,
    ): fnptr<[int32, int32], bool> {
      return value;
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static Tsonic.CSharp.Runtime.Location<int> neutralAddress(Tsonic.CSharp.Runtime.Location<int> value)
        {
            return value;
        }
        public static unsafe int* aliasAddress(int* value)
        {
            return value;
        }
        public static unsafe delegate*<int, int, bool> neutralCallback(delegate*<int, int, bool> value)
        {
            return value;
        }
        public static unsafe delegate*<int, int, bool> aliasCallback(delegate*<int, int, bool> value)
        {
            return value;
        }
    }
}
`);
  assert.match(
    compiled.artifacts.get("TsonicGenerated.csproj"),
    /<AllowUnsafeBlocks>true<\/AllowUnsafeBlocks>/u,
  );
});

test("source-owned generic calls consume the reconstructed callable contract", () => {
  const compiled = cleanCompile(`
    import type { int } from "@tsonic/csharp/types.js";

    export function identity<T>(value: T): T {
      return value;
    }

    export function run(seed: int): int {
      return identity<int>(seed);
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static T identity<T>(T value)
        {
            return value;
        }
        public static int run(int seed)
        {
            return identity<int>(seed);
        }
    }
}
`);
});

test("explicit source-owned type arguments do not depend on argument inference", () => {
  const compiled = cleanCompile(`
    import type { int } from "@tsonic/csharp/types.js";

    function transform<T, U>(value: T, fn: (input: T) => U): U {
      return fn(value);
    }

    export function main(): string {
      return transform<int, string>(7, (value) => "N=" + value);
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static U transform<T, U>(T value, Func<T, U> fn)
        {
            return fn(value);
        }
        public static string main()
        {
            return transform<int, string>(7, (int value) => "N=" + value);
        }
    }
}
`);
});

test("generic delegate calls consume the selected signature return type", () => {
  const compiled = cleanCompile(`
    export function transform<T, U>(
      value: T,
      fn: (input: T) => U,
    ): U {
      return fn(value);
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static U transform<T, U>(T value, Func<T, U> fn)
        {
            return fn(value);
        }
    }
}
`);
});

test("delegate-valued calls use their exact carrier without inventing declaration artifacts", () => {
  const compiled = cleanCompile(`
    export function invoke(next: () => string): string { return next(); }
    export function run(): string {
      const next = (): string => "ready";
      return invoke(next);
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static string invoke(Func<string> next)
        {
            return next();
        }
        public static string run()
        {
            Func<string> next = () => "ready";
            return invoke(next);
        }
    }
}
`);
});

test("source overload declarations select exact evidence without becoming emitted artifacts", () => {
  const compiled = cleanCompile(`
    export class Formatter {
      constructor(prefix: string);
      constructor(prefix: string, suffix?: string);
      constructor(prefix: string, suffix?: string) {
        this.prefix = suffix === undefined ? prefix : prefix + suffix;
      }

      prefix: string;

      format(value: string): string;
      format(value: string, suffix?: string): string;
      format(value: string, suffix?: string): string {
        return this.prefix + value + (suffix ?? "");
      }
    }

    export function run(): string {
      const formatter = new Formatter("[", "]");
      return formatter.format("ready");
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static string run()
        {
            Formatter formatter = new Formatter("[", "]");
            return formatter.format("ready");
        }
    }
    public class Formatter
    {
        public Formatter(string prefix, string? suffix = null)
        {
            this.prefix = suffix is null ? prefix : prefix + suffix;
        }
        public string prefix;
        public string format(string value, string? suffix = null)
        {
            return this.prefix + value + (suffix ?? "");
        }
    }
}
`);
});

test("interface method calls consume the emitted interface callable contract", () => {
  const compiled = cleanCompile(`
    import type { int } from "@tsonic/csharp/types.js";
    export interface Reader {
      read(value: int): string;
    }
    export function call(reader: Reader, value: int): string {
      return reader.read(value);
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static string call(Reader reader, int value)
        {
            return reader.read(value);
        }
    }
    public interface Reader
    {
        string read(int value);
    }
}
`);
});

function cleanCompile(sourceText) {
  const compiled = compileCsharpSource({ sourceText });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  return compiled;
}
