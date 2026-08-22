import assert from "node:assert/strict";
import test from "node:test";
import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";

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
        public static int[] tail
        {
            get;
            private set;
        } = default(int[])!;
        public static int[] values
        {
            get;
            private set;
        } = default(int[])!;
        private static readonly System.Lazy<object?> __tsonic_module_initialization = new System.Lazy<object?>(() => __tsonic_module_init_core());
        private static object? __tsonic_module_init_core()
        {
            tail = new int[] { 2, 3 };
            values = Tsonic.CSharp.Runtime.ArrayHelpers.Concat(new int[] { 1 }, tail);
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

test("direct C# translation consumes the exact shared FixedArray contract", () => {
  const compiled = cleanCompile(`
    import type { FixedArray, int32, uint8 } from "@tsonic/core/types.js";

    export function update(values: FixedArray<uint8, 4>, index: int32): uint8 {
      values[index] = 9;
      return values[0];
    }

    export function size(values: FixedArray<uint8, 4>): int32 {
      return values.length;
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static byte update(byte[] values, int index)
        {
            values[index] = 9;
            return values[0];
        }
        public static int size(byte[] values)
        {
            return values.Length;
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
        string name { get; set; }
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

test("direct C# translation selects exact provider overloads and source-core attribute applications in one provider session", () => {
  const compiled = cleanCompile(`
    import { attribute } from "@tsonic/core/lang.js";
    import { out } from "@tsonic/csharp/lang.js";
    import type { int } from "@tsonic/csharp/types.js";
    import {
      Console,
      Int32,
      ObsoleteAttribute,
      SerializableAttribute,
    } from "@tsonic/dotnet/System.js";

    export class User {
      constructor(id: string) {}
      name = "";
      get display(): string { return this.name; }
      save(route: string): void {}
    }

    attribute<User>().add(SerializableAttribute);
    attribute<User>().add(ObsoleteAttribute, "class");
    attribute<User>().constructor().add(ObsoleteAttribute, "constructor");
    attribute<User>().constructor().parameter("id").add(ObsoleteAttribute, "id");
    attribute<User>().property((target) => target.name).add(ObsoleteAttribute, "field");
    attribute<User>().method((target) => target.save).add(ObsoleteAttribute, "method");

    export function report(path: string): number {
      const parts = path.Split("/");
      const ok = path.StartsWith("/");
      Console.WriteLine(parts.Length);
      return ok ? parts.Length : 0;
    }

    export function parse(text: string): int {
      let value: int = 0;
      Int32.TryParse(text, out(value));
      return value;
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
        public static int parse(string text)
        {
            int value = 0;
            System.Int32.TryParse(text, out value);
            return value;
        }
    }
    [System.SerializableAttribute]
    [System.ObsoleteAttribute("class")]
    public class User
    {
        [System.ObsoleteAttribute("constructor")]
        public User([System.ObsoleteAttribute("id")] string id)
        {
        }
        [System.ObsoleteAttribute("field")]
        public string name = "";
        public string display
        {
            get
            {
                return this.name;
            }
        }
        [System.ObsoleteAttribute("method")]
        public void save(string route)
        {
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
        public static double one
        {
            get;
            private set;
        } = default(double)!;
        public static int second((string, int) pair)
        {
            return pair.Item2;
        }
        public static int update(int[] values, int index, Func<int> next)
        {
            return values[index++] += next();
        }
        private static readonly System.Lazy<object?> __tsonic_module_initialization = new System.Lazy<object?>(() => __tsonic_module_init_core());
        private static object? __tsonic_module_init_core()
        {
            one = 1;
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
            return Tsonic.CSharp.Js.String.toUpperCase(Tsonic.CSharp.Js.String.trim(text)) + Tsonic.CSharp.Js.Array.join(values, ",");
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
        public static __TsonicShape_c88cee3c96ce65c5f8a681bbc9553ad7568113d8c4159b6959bc39913b929782 make(int age)
        {
            return new __TsonicShape_c88cee3c96ce65c5f8a681bbc9553ad7568113d8c4159b6959bc39913b929782
            {
                name = "Ada",
                age = age,
            };
        }
        public static int total(__TsonicShape_c88cee3c96ce65c5f8a681bbc9553ad7568113d8c4159b6959bc39913b929782 user)
        {
            __TsonicShape_c88cee3c96ce65c5f8a681bbc9553ad7568113d8c4159b6959bc39913b929782 __tsonic_destructure0 = user;
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
    public class __TsonicShape_c88cee3c96ce65c5f8a681bbc9553ad7568113d8c4159b6959bc39913b929782
    {
        public required int age;
        public required string name;
    }
}
`,
  );
});

test("direct C# translation preserves explicit source-owned construction arguments", () => {
  const compiled = cleanCompile(`
    import type { int } from "@tsonic/csharp/types.js";
    export class Counter<T> {
      value: T;
      constructor(value: T) { this.value = value; }
    }
    export function make(value: int): Counter<int> {
      return new Counter<int>(value);
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static Counter<int> make(int value)
        {
            return new Counter<int>(value);
        }
    }
    public class Counter<T>
    {
        public T value;
        public Counter(T value)
        {
            this.value = value;
        }
    }
}
`);
});

test("direct C# translation lowers homogeneous variadic tuples as array carriers", () => {
  const compiled = cleanCompile(`
    import type { int } from "@tsonic/csharp/types.js";
    export function unpack(
      [first, second = 2, ...tail]: [int, int?, ...int[]],
    ): int {
      const [head, ...rest] = tail;
      return first + second + head + rest.Length;
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static int unpack(int[] __tsonic_param0)
        {
            int first = __tsonic_param0[0];
            int second = __tsonic_param0.Length > 1 ? __tsonic_param0[1] : 2;
            int[] tail = Tsonic.CSharp.Runtime.ArrayHelpers.Slice(__tsonic_param0, 2);
            int[] __tsonic_destructure0 = tail;
            int head = __tsonic_destructure0[0];
            int[] rest = Tsonic.CSharp.Runtime.ArrayHelpers.Slice(__tsonic_destructure0, 1);
            return first + second + head + rest.Length;
        }
    }
}
`);
});

test("direct JS translation retains an object literal's exact selected value shape", () => {
  const compiled = cleanCompile(`
    export function keys(text: string): string {
      return Object.keys({ text }).join(",");
    }
  `, { surface: "js" });

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static string keys(string text)
        {
            return Tsonic.CSharp.Js.Array.join(new __TsonicShape_7c3b331cd5d1373643f5977483d6aa93166da6914d799c49e21ed27cf150e1f8
            {
                text = text,
            }.__tsonicObjectKeys_48e9fd789833(), ",");
        }
    }
}
`);
  assert.equal(
    compiled.artifacts.get("generated/TsonicObjectShapes.cs"),
    `using System;

namespace Tsonic.Generated
{
    public class __TsonicShape_7c3b331cd5d1373643f5977483d6aa93166da6914d799c49e21ed27cf150e1f8
    {
        public required string text;
        public Tsonic.CSharp.Js.JSArray<string> __tsonicObjectKeys_48e9fd789833()
        {
            return new Tsonic.CSharp.Js.JSArray<string>(new string[] { "text" });
        }
    }
}
`,
  );
});

test("direct JS translation emits exact closed own-property projections", () => {
  const compiled = cleanCompile(`
    export function project(): boolean {
      const value = { tail: "tail", 10: "ten", 2: "two", "01": "leading" };
      const keys = Object.keys(value);
      const values = Object.values(value);
      const entries = Object.entries(value);
      const reordered = { "01": "leading", tail: "tail", 2: "two", 10: "ten" };
      const reorderedKeys = Object.keys(reordered);
      let backing = "value";
      let reads = 0;
      const accessed = {
        tail: "tail",
        get current(): string { reads += 1; return backing; },
        set current(next: string) { backing = next; },
      };
      const accessorKeys = Object.keys(accessed);
      const accessorValues = Object.values(accessed);
      const accessorEntries = Object.entries(accessed);
      return keys.length === 4 && values.length === 4 && entries.length === 4 &&
        reorderedKeys.length === 4 && accessorKeys.length === 2 &&
        accessorValues.length === 2 && accessorEntries.length === 2 &&
        reads === 2 && Object.hasOwn(value, "tail") && value.hasOwnProperty("01");
    }
  `, { surface: "js" });

  const source = compiled.artifacts.get("src/Index.cs");
  const shapes = compiled.artifacts.get("generated/TsonicObjectShapes.cs");
  assert.doesNotMatch(source, /Tsonic\.CSharp\.Js\.Object\.(?:keys|values|entries|hasOwn)/u);
  assert.match(source, /\.__tsonicObjectKeys_[a-f0-9]{12}\(\)/u);
  assert.match(source, /\.__tsonicObjectValues_[a-f0-9]{12}\(\)/u);
  assert.match(source, /\.__tsonicObjectEntries_[a-f0-9]{12}\(\)/u);
  assert.equal(source.match(/\.__tsonicObjectHasOwn_[a-f0-9]{12}\(/gu)?.length, 2);
  assert.match(
    shapes,
    /new string\[\] \{ "2", "10", "tail", "01" \}/u,
  );
  assert.match(
    shapes,
    /new string\[\] \{ "2", "10", "01", "tail" \}/u,
  );
  assert.equal(
    new Set(source.match(/__tsonicObjectKeys_[a-f0-9]{12}/gu)).size,
    3,
  );
  assert.match(shapes, /new string\[\] \{ "tail", "current" \}/u);
  assert.match(shapes, /__tsonic_shape_accessor_getter_/u);
  assert.match(shapes, /public Tsonic\.CSharp\.Js\.JSArray<string> __tsonicObjectValues_/u);
  assert.match(shapes, /public Tsonic\.CSharp\.Js\.JSArray<\(string, string\)> __tsonicObjectEntries_/u);
  assert.match(
    shapes,
    /key == "01" \|\| key == "10" \|\| key == "2" \|\| key == "tail"/u,
  );
});

test("direct JS translation rejects open nominal own-property projections", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      interface Named { name: string }
      export function keys(value: Named): string[] {
        return Object.keys(value);
      }
    `,
    surface: "js",
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(
    compiled.targetDiagnostics.map(({ code, message }) => ({ code, message })),
    [{
      code: "CSHARP_UNSUPPORTED_AST",
      message:
        "Selected 'keys' operation requires one exact generated structural object carrier; an open nominal source type cannot prove its runtime own-property set.",
    }],
  );
  assert.deepEqual([...compiled.artifacts], []);
});

test("direct C# translation retains a project interface as object-literal context", () => {
  const compiled = cleanCompile(`
    import type { int } from "@tsonic/csharp/types.js";
    export interface User { name: string; age: int; }
    export function make(age: int): User {
      return { name: "Ada", age };
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static User make(int age)
        {
            return new __TsonicShape_dd72a4213d6e4f12c20240881a17dda7d40e2296d786ac392c5eb74a99ff1324
            {
                name = "Ada",
                age = age,
            };
        }
    }
    public interface User
    {
        string name { get; set; }
        int age { get; set; }
    }
}
`);
  assert.equal(
    compiled.artifacts.get("generated/TsonicObjectShapes.cs"),
    `using System;

namespace Tsonic.Generated
{
    public class __TsonicShape_dd72a4213d6e4f12c20240881a17dda7d40e2296d786ac392c5eb74a99ff1324 : User
    {
        public required int age
        {
            get;
            set;
        }
        public required string name
        {
            get;
            set;
        }
    }
}
`,
  );
});

test("direct C# dynamic translation closes every supported any operation", () => {
  const compiled = cleanCompile(`
    export function use(value: any, key: string): any {
      value.name;
      value.name = 1;
      value[key];
      value[key] = 2;
      value(3);
      value.create(4);
      value[key](5);
      new value(6);
      value + 1;
      value && value;
      !value;
      typeof value;
      void value;
      if (value) return value;
      return value ? value : key;
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static Tsonic.CSharp.Runtime.TsValue use(Tsonic.CSharp.Runtime.TsValue value, string key)
        {
            value.ReadDynamicSlot("name");
            value.WriteDynamicSlot("name", 1);
            value.ReadDynamicElement(key);
            value.WriteDynamicElement(key, 2);
            value.InvokeDynamic(3);
            value.InvokeDynamicSlot("create", false, false, () => new object?[] { 4 });
            value.InvokeDynamicElement(() => key, false, false, () => new object?[] { 5 });
            value.ConstructDynamic(6);
            Tsonic.CSharp.Runtime.TsValue.ApplyDynamicBinary(value, "+", 1);
            Tsonic.CSharp.Runtime.TsValue.ApplyDynamicLogical(value, "&&", () => value);
            Tsonic.CSharp.Runtime.TsValue.ApplyDynamicUnaryBoolean(value, "!");
            Tsonic.CSharp.Runtime.TsValue.ApplyDynamicTypeof(value);
            _ = value;
            if (Tsonic.CSharp.Runtime.TsValue.ToDynamicBoolean(value))
            {
                return value;
            }
            return Tsonic.CSharp.Runtime.TsValue.ToDynamicBoolean(value) ? value : Tsonic.CSharp.Runtime.TsValue.from(key);
        }
    }
}
`);
});

test("direct C# dynamic translation preserves optional-chain evaluation regions", () => {
  const compiled = cleanCompile(`
    export function optional(
      value: any,
      key: () => string,
      argument: () => any,
    ): any {
      value?.name;
      value?.[key()];
      value?.(argument());
      value?.create(argument());
      value.create?.(argument());
      value?.[key()]?.(argument());
      return value ?? argument();
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static Tsonic.CSharp.Runtime.TsValue optional(Tsonic.CSharp.Runtime.TsValue value, Func<string> key, Func<Tsonic.CSharp.Runtime.TsValue> argument)
        {
            value.ReadDynamicSlotOptional("name");
            value.ReadDynamicElementOptional(() => key());
            value.InvokeDynamicOptional(() => new object?[] { argument() });
            value.InvokeDynamicSlot("create", true, false, () => new object?[] { argument() });
            value.InvokeDynamicSlot("create", false, true, () => new object?[] { argument() });
            value.InvokeDynamicElement(() => key(), true, true, () => new object?[] { argument() });
            return Tsonic.CSharp.Runtime.TsValue.ApplyDynamicLogical(value, "??", () => argument());
        }
    }
}
`);
});

test("direct C# dynamic translation lowers instanceof through the exact closed carrier", () => {
  const compiled = compileCsharpSource({
    sourceText: [
      "class Marker {}",
      "export function test(value: any): boolean {",
      "  return value instanceof Marker;",
      "}",
    ].join("\n"),
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.match(
    compiled.artifacts.get("src/Index.cs") ?? "",
    /return Tsonic\.CSharp\.Runtime\.TsValue\.IsDynamicInstanceOf<Marker>\(value\);/u,
  );
});

function cleanCompile(sourceText, options = {}) {
  const compiled = compileCsharpSource({ sourceText, ...options });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  return compiled;
}
