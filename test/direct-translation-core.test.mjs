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

test("direct C# translation consumes checker-proven tuple ordinals and authored callable aliases", () => {
  const compiled = cleanCompile(`
    import type { int } from "@tsonic/csharp/types.js";
    const one = 1 as const;
    export function second(pair: [string, int]): int {
      return pair[one];
    }
    export function update(values: int[], index: int, next: () => int): int {
      return values[index++] += next();
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static readonly double one;
        public static int second((string, int) pair)
        {
            return pair.Item2;
        }
        public static int update(int[] values, int index, Func<int> next)
        {
            return values[index++] += next();
        }
        static Index()
        {
            one = 1;
        }
        public static void __tsonic_module_init()
        {
        }
    }
}
`);
});

test("direct C# translation selects the explicit JS array carrier for array syntax", () => {
  const compiled = cleanCompile(`
    export function edit(text: string, values: number[]): string {
      values.push(Number.parseInt(text, 10));
      return text.trim().toUpperCase() + values.join(",");
    }
  `, { surface: "js" });

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static string edit(string text, Tsonic.CSharp.Js.JSArray<double> values)
        {
            values.push(Tsonic.CSharp.Js.Number.parseInt(text, 10));
            return Tsonic.CSharp.Js.String.toUpperCase(Tsonic.CSharp.Js.String.trim(text)) + values.join(",");
        }
    }
}
`);
});

test("direct C# translation constructs one exact runtime-union arm per branch", () => {
  const compiled = cleanCompile(`
    import type { int } from "@tsonic/csharp/types.js";
    export function choose(flag: boolean): int | string {
      return flag ? 1 : "one";
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static Tsonic.CSharp.Runtime.Union<int, string> choose(bool flag)
        {
            return flag ? Tsonic.CSharp.Runtime.Union<int, string>.From1(1) : Tsonic.CSharp.Runtime.Union<int, string>.From2("one");
        }
    }
}
`);
});

test("direct C# translation closes structural aliases, literals, and destructured projections", () => {
  const compiled = cleanCompile(`
    import type { int } from "@tsonic/csharp/types.js";
    type User = { name: string; age: int };
    export function make(age: int): User {
      return { name: "Ada", age };
    }
    export function total(user: User): int {
      const { age } = user;
      return age;
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static __TsonicShape_698c6eaed071825052bb6167e814f68e5eebdf379fa5c0cdd5ba98c3eae2e35a make(int age)
        {
            return new __TsonicShape_698c6eaed071825052bb6167e814f68e5eebdf379fa5c0cdd5ba98c3eae2e35a
            {
                name = "Ada",
                age = age,
            };
        }
        public static int total(__TsonicShape_698c6eaed071825052bb6167e814f68e5eebdf379fa5c0cdd5ba98c3eae2e35a user)
        {
            __TsonicShape_698c6eaed071825052bb6167e814f68e5eebdf379fa5c0cdd5ba98c3eae2e35a __tsonic_destructure0 = user;
            int age = __tsonic_destructure0.age;
            return age;
        }
    }
}
`);
  assert.equal(
    compiled.artifacts.get("generated/TsonicObjectShapes.cs"),
    `using System;

namespace Tsonic.Generated
{
    public class __TsonicShape_698c6eaed071825052bb6167e814f68e5eebdf379fa5c0cdd5ba98c3eae2e35a
    {
        public required string name;
        public required int age;
    }
}
`,
  );
});

function cleanCompile(sourceText, options = {}) {
  const compiled = compileCsharpSource({ sourceText, ...options });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.result.diagnostics, []);
  return compiled;
}
