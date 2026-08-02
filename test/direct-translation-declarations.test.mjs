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

function cleanCompile(sourceText) {
  const compiled = compileCsharpSource({ sourceText });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.result.diagnostics, []);
  return compiled;
}
