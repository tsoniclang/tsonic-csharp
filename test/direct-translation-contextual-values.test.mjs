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
        public static readonly __TsonicShape_c365ef61ecc767cb701e433a9cc80d7757ffb839a3414c0a44cd65c90438ea77 nextId;
        public static int takeNext()
        {
            int id = nextId.value;
            nextId.value = id + 1;
            return id;
        }
        static Index()
        {
            nextId = new __TsonicShape_c365ef61ecc767cb701e433a9cc80d7757ffb839a3414c0a44cd65c90438ea77
            {
                value = 1,
            };
        }
        public static void __tsonic_module_init()
        {
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
