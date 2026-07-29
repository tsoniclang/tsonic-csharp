import assert from "node:assert/strict";
import test from "node:test";
import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

test("direct C# translation preserves authored primitive aliases and array carriers", () => {
  const compiled = cleanCompile(`
    import type { int } from "@tsonic/csharp/types.js";
    const tail: int[] = [2, 3];
    export const values: int[] = [1, ...tail];
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static readonly int[] tail;
        public static readonly int[] values;
        static Index()
        {
            tail = new int[] { 2, 3 };
            values = Tsonic.CSharp.Runtime.ArrayHelpers.Concat(new int[] { 1 }, tail);
        }
        public static void __tsonic_module_init()
        {
        }
    }
}
`);
});

test("direct C# translation lowers optional and rest parameters from checked source types", () => {
  const compiled = cleanCompile(`
    import type { int } from "@tsonic/csharp/types.js";
    export function sum(first: int, second?: int, ...rest: int[]): int {
      return first + (second ?? 0) + (rest.Length === 0 ? 0 : rest[0]);
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static int sum(int first, int? second = null, params int[] rest)
        {
            return first + (second ?? 0) + (rest.Length == 0 ? 0 : rest[0]);
        }
    }
}
`);
});

test("direct C# translation retains optional-chain result nullability", () => {
  const compiled = cleanCompile(`
    export interface User { name: string; }
    export function size(user: User | undefined): number {
      return user?.name.length ?? 0;
    }
  `, { surface: "js" });

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static double size(User? user)
        {
            return user?.name?.Length ?? 0;
        }
    }
    public interface User
    {
        string name { get; }
    }
}
`);
});

test("direct C# translation closes source-owned generic properties from selected checker types", () => {
  const compiled = cleanCompile(`
    export class Box<T> {
      value: T;
      constructor(value: T) { this.value = value; }
    }
    export function read(box: Box<string>): string {
      return box.value;
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static string read(Box<string> box)
        {
            return box.value;
        }
    }
    public class Box<T>
    {
        public T value;
        public Box(T value)
        {
            this.value = value;
        }
    }
}
`);
});

test("direct C# translation derives for-of target elements from the exact iterable carrier", () => {
  const compiled = cleanCompile(`
    import type { int } from "@tsonic/csharp/types.js";
    export function total(values: int[]): int {
      let result: int = 0;
      for (const value of values) {
        result += value;
      }
      return result;
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static int total(int[] values)
        {
            int result = 0;
            foreach (int value in values)
            {
                result += value;
            }
            return result;
        }
    }
}
`);
});

test("direct C# translation selects the best collapsed provider overload from target conversions", () => {
  const compiled = cleanCompile(`
    import { Console } from "@tsonic/dotnet/System.js";
    export function report(path: string): number {
      const parts = path.Split("/");
      const ok = path.StartsWith("/");
      Console.WriteLine(parts.Length);
      return ok ? parts.Length : 0;
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static double report(string path)
        {
            string[] parts = path.Split("/");
            bool ok = path.StartsWith("/");
            System.Console.WriteLine(parts.Length);
            return ok ? parts.Length : 0;
        }
    }
}
`);
});

function cleanCompile(sourceText, options = {}) {
  const compiled = compileCsharpSource({ sourceText, ...options });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.result.diagnostics, []);
  return compiled;
}
