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
        string name { get; }
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

test("direct C# declaration translation closes pointer and function-pointer aliases", () => {
  const compiled = cleanCompile(`
    import type { fnptr, ptr } from "@tsonic/core/lang.js";
    import type { bool, int32 } from "@tsonic/core/types.js";

    export function address(value: ptr<int32>): ptr<int32> {
      return value;
    }

    export function callback(
      value: fnptr<[int32, int32], bool>,
    ): fnptr<[int32, int32], bool> {
      return value;
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public unsafe static class Index
    {
        public static int* address(int* value)
        {
            return value;
        }
        public static delegate*<int, int, bool> callback(delegate*<int, int, bool> value)
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
