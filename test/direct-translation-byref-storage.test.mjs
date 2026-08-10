import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

const libraryModuleInitializer = `namespace Tsonic.Generated
{
    internal static class TsonicModuleInitializer
    {
        [System.Runtime.CompilerServices.ModuleInitializerAttribute]
        [System.Diagnostics.CodeAnalysis.SuppressMessageAttribute("Usage", "CA2255")]
        internal static void Initialize()
        {
            Index.__tsonic_module_init();
        }
    }
}
`;

test("selected nullable target outputs reconstruct exact source storage", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { Dictionary } from "@tsonic/dotnet/System.Collections.Generic.js";
      import { defaultof, out } from "@tsonic/csharp/lang.js";
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
  assert.deepEqual(compiled.targetDiagnostics, []);
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
        int id { get; set; }
    }
}
`,
    "generated/TsonicModuleInitializer.cs": libraryModuleInitializer,
  });
});

test("public storage changes reconstruct transitive module callers to a fixed point", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { read } from "./reader.js";
      export function forward() { return read(); }
    `,
    files: {
      "reader.ts": `
        import { current } from "./state.js";
        export function read() { return current; }
      `,
      "state.ts": `
        import { Dictionary } from "@tsonic/dotnet/System.Collections.Generic.js";
        import { defaultof, out } from "@tsonic/csharp/lang.js";
        import type { int } from "@tsonic/csharp/types.js";

        export interface Todo { id: int; }
        const values = new Dictionary<int, Todo>();
        export let current = defaultof<Todo>();
        values.TryGetValue(1, out(current));
      `,
    },
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
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
    "src/State.cs": `using System;

namespace Tsonic.Generated
{
    public static class State
    {
        public static System.Collections.Generic.Dictionary<int, Todo> values
        {
            get;
            private set;
        } = default(System.Collections.Generic.Dictionary<int, Todo>)!;
        public static Todo? current
        {
            get;
            internal set;
        } = default(Todo?)!;
        private static readonly System.Lazy<object?> __tsonic_module_initialization = new System.Lazy<object?>(() => __tsonic_module_init_core());
        private static object? __tsonic_module_init_core()
        {
            values = new System.Collections.Generic.Dictionary<int, Todo>();
            current = default(Todo)!;
            values.TryGetValue(1, out current);
            return null;
        }
        public static void __tsonic_module_init()
        {
            _ = __tsonic_module_initialization.Value;
        }
    }
    public interface Todo
    {
        int id { get; set; }
    }
}
`,
    "src/Reader.cs": `using System;

namespace Tsonic.Generated
{
    public static class Reader
    {
        public static Todo? read()
        {
            return State.current;
        }
        private static readonly System.Lazy<object?> __tsonic_module_initialization = new System.Lazy<object?>(() => __tsonic_module_init_core());
        private static object? __tsonic_module_init_core()
        {
            State.__tsonic_module_init();
            return null;
        }
        public static void __tsonic_module_init()
        {
            _ = __tsonic_module_initialization.Value;
        }
    }
}
`,
    "src/Index.cs": `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static Todo? forward()
        {
            return Reader.read();
        }
        private static readonly System.Lazy<object?> __tsonic_module_initialization = new System.Lazy<object?>(() => __tsonic_module_init_core());
        private static object? __tsonic_module_init_core()
        {
            Reader.__tsonic_module_init();
            return null;
        }
        public static void __tsonic_module_init()
        {
            _ = __tsonic_module_initialization.Value;
        }
    }
}
`,
    "generated/TsonicModuleInitializer.cs": libraryModuleInitializer,
  });
});
