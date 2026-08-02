import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

test("direct C# translation separates flow-selected values from nullable storage and contextual contracts", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      export interface TodoCreateInput { title: string; id: int; }
      function makeTodo(title: string, id: int | undefined): TodoCreateInput | undefined {
        if (id === undefined) return undefined;
        return { title, id };
      }
      export function report(title: string, id: int | undefined): void {
        const todo = makeTodo(title, id);
        if (todo !== undefined) consume(todo.id);
      }
      function consume(value: int): void { void value; }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.result.diagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static TodoCreateInput? makeTodo(string title, int? id)
        {
            if (id is null)
            {
                return null;
            }
            return new __TsonicShape_1c0b90e5a00cb4bdeca7d1ab67551f02e0e40e230d3cad6be8948fbf72c7987a
            {
                title = title,
                id = id.Value,
            };
        }
        public static void report(string title, int? id)
        {
            TodoCreateInput? todo = makeTodo(title, id);
            if (todo is not null)
            {
                consume(todo.id);
            }
        }
        public static void consume(int value)
        {
            _ = value;
        }
    }
    public interface TodoCreateInput
    {
        string title { get; }
        int id { get; }
    }
}
`);
  assert.equal(
    compiled.artifacts.get("generated/TsonicObjectShapes.cs"),
    `using System;

namespace Tsonic.Generated
{
    public class __TsonicShape_1c0b90e5a00cb4bdeca7d1ab67551f02e0e40e230d3cad6be8948fbf72c7987a : TodoCreateInput
    {
        public required string title
        {
            get;
            set;
        }
        public required int id
        {
            get;
            set;
        }
    }
}
`,
  );
});

test("direct C# translation preserves authored primitive aliases through structural property flow", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      const nextId: { value: int } = { value: 1 };
      export function takeNext(): int {
        const id = nextId.value;
        nextId.value = id + 1;
        return id;
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.result.diagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static __TsonicShape_c365ef61ecc767cb701e433a9cc80d7757ffb839a3414c0a44cd65c90438ea77 nextId
        {
            get;
            private set;
        } = default(__TsonicShape_c365ef61ecc767cb701e433a9cc80d7757ffb839a3414c0a44cd65c90438ea77)!;
        public static int takeNext()
        {
            int id = nextId.value;
            nextId.value = id + 1;
            return id;
        }
        private static readonly System.Lazy<object?> __tsonic_module_initialization = new System.Lazy<object?>(() => __tsonic_module_init_core());
        private static object? __tsonic_module_init_core()
        {
            nextId = new __TsonicShape_c365ef61ecc767cb701e433a9cc80d7757ffb839a3414c0a44cd65c90438ea77
            {
                value = 1,
            };
            return null;
        }
        public static void __tsonic_module_init()
        {
            _ = __tsonic_module_initialization.Value;
        }
    }
}
`);
  assert.equal(
    compiled.artifacts.get("generated/TsonicObjectShapes.cs"),
    `using System;

namespace Tsonic.Generated
{
    public class __TsonicShape_c365ef61ecc767cb701e433a9cc80d7757ffb839a3414c0a44cd65c90438ea77
    {
        public required int value;
    }
}
`,
  );
});

test("direct C# translation uses checker-declared mutable storage instead of literal initializer storage", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      export function sum(...values: number[]): number {
        let total = 0;
        for (const value of values) total = total + value;
        return total;
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.result.diagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static double sum(params double[] values)
        {
            double total = 0;
            foreach (double value in values)
            {
                total = total + value;
            }
            return total;
        }
    }
}
`);
});

test("direct C# translation preserves the exact JS array receiver element carrier for index access", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      export function replace(values: int[], index: int, value: int): int {
        values[index] = value;
        return values[index];
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.result.diagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static int replace(Tsonic.CSharp.Js.JSArray<int> values, int index, int value)
        {
            values[index] = value;
            return values[index];
        }
    }
}
`);
});

test("direct C# translation preserves the expected primitive carrier across nullish array reads", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      export function atOr(values: int[], index: int): int {
        return values.at(index) ?? -1;
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.result.diagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static int atOr(Tsonic.CSharp.Js.JSArray<int> values, int index)
        {
            return Tsonic.CSharp.Js.Array.atValue(values, index) ?? -1;
        }
    }
}
`);
});

test("direct C# translation derives generic JS array factories from exact source argument carriers", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      export function copy(values: int[]): int[] {
        return Array.from(values);
      }
      export function make(left: int, right: int): int[] {
        return Array.of(left, right);
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.result.diagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static Tsonic.CSharp.Js.JSArray<int> copy(Tsonic.CSharp.Js.JSArray<int> values)
        {
            return Tsonic.CSharp.Js.JSArrayStatics.from<int>(values);
        }
        public static Tsonic.CSharp.Js.JSArray<int> make(int left, int right)
        {
            return Tsonic.CSharp.Js.JSArrayStatics.of<int>(left, right);
        }
    }
}
`);
});

test("direct C# translation preserves explicit void discard intent", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      async function work(): Promise<void> {}
      function finish(): void {}
      export function run(): void {
        void work();
        void finish();
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.result.diagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static async System.Threading.Tasks.Task work()
        {
        }
        public static void finish()
        {
        }
        public static void run()
        {
            _ = work();
            finish();
        }
    }
}
`);
});
