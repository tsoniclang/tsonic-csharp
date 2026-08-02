import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

test("selected nullable target outputs reconstruct exact source storage", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { Dictionary } from "@tsonic/dotnet/System.Collections.Generic.js";
      import { defaultof, out } from "@tsonic/core/lang.js";
      import type { int } from "@tsonic/csharp/types.js";

      export interface Todo { id: int; }
      const todos = new Dictionary<int, Todo>();

      export function getById(id: int): Todo | undefined {
        let value = defaultof<Todo>();
        if (todos.TryGetValue(id, out(value))) return value;
        return undefined;
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.result.diagnostics, []);
  assert.deepEqual(Object.fromEntries(compiled.artifacts), {
    "TsonicGenerated.csproj": `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>disable</ImplicitUsings>
    <OutputType>Library</OutputType>
  </PropertyGroup>
</Project>
`,
    "src/Index.cs": `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static System.Collections.Generic.Dictionary<int, Todo> todos
        {
            get;
            private set;
        } = default(System.Collections.Generic.Dictionary<int, Todo>)!;
        public static Todo? getById(int id)
        {
            Todo? value = default(Todo)!;
            if (todos.TryGetValue(id, out value))
            {
                return value;
            }
            return null;
        }
        private static readonly System.Lazy<object?> __tsonic_module_initialization = new System.Lazy<object?>(() => __tsonic_module_init_core());
        private static object? __tsonic_module_init_core()
        {
            todos = new System.Collections.Generic.Dictionary<int, Todo>();
            return null;
        }
        public static void __tsonic_module_init()
        {
            _ = __tsonic_module_initialization.Value;
        }
    }
    public interface Todo
    {
        int id { get; }
    }
}
`,
  });
});
