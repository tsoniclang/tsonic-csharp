import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";

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
  assert.deepEqual(sourceArtifacts(compiled), {
    "src/Index.cs": `namespace Tsonic.Generated
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
            if (global::Tsonic.Generated.Index.todos.TryGetValue(id, out value))
            {
                return value;
            }
            return default(Todo?);
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
  assert.deepEqual(sourceArtifacts(compiled), {
    "src/State.cs": `namespace Tsonic.Generated
{
    public static class State
    {
        public static System.Collections.Generic.Dictionary<int, Todo> values
        {
            get;
            private set;
        } = default(System.Collections.Generic.Dictionary<int, Todo>)!;
        public static Todo? current = default(Todo?)!;
        private static readonly System.Lazy<object?> __tsonic_module_initialization = new System.Lazy<object?>(() => __tsonic_module_init_core());
        private static object? __tsonic_module_init_core()
        {
            values = new System.Collections.Generic.Dictionary<int, Todo>();
            current = default(Todo)!;
            global::Tsonic.Generated.State.values.TryGetValue(1, out global::Tsonic.Generated.State.current);
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
    "src/Reader.cs": `namespace Tsonic.Generated
{
    public static class Reader
    {
        public static Todo? read()
        {
            return global::Tsonic.Generated.State.current;
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
    "src/Index.cs": `namespace Tsonic.Generated
{
    public static class Index
    {
        public static Todo? forward()
        {
            return global::Tsonic.Generated.Reader.read();
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
  executeCsharpConstruction(compiled, "transitive-module-byref-storage", false, false, [],
    `if (Tsonic.Generated.Index.forward() is not null) throw new System.Exception("native absence was lost");
var item = new NativeTodo { id = 7 };
Tsonic.Generated.State.values.Add(1, item);
if (!Tsonic.Generated.State.values.TryGetValue(1, out Tsonic.Generated.State.current)) throw new System.Exception("native presence was lost");
for (int iteration = 0; iteration < 1000; iteration++) {
    if (!System.Object.ReferenceEquals(Tsonic.Generated.Index.forward(), item)) throw new System.Exception("native identity was lost");
}
long before = System.GC.GetAllocatedBytesForCurrentThread();
for (int iteration = 0; iteration < 10000; iteration++) {
    if (!System.Object.ReferenceEquals(Tsonic.Generated.Index.forward(), item)) throw new System.Exception("native identity was lost");
}
if (System.GC.GetAllocatedBytesForCurrentThread() != before) throw new System.Exception("native reference forwarding must not allocate");
if (Tsonic.Generated.State.values.TryGetValue(2, out Tsonic.Generated.State.current)) throw new System.Exception("native missing key was lost");
if (Tsonic.Generated.Index.forward() is not null) throw new System.Exception("native absence after replacement was lost");
sealed class NativeTodo : Tsonic.Generated.Todo { public int id { get; set; } }
`);
});

test("native module byref storage preserves destructured leaves and namespace identity", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { Int32 } from "@tsonic/dotnet/System.js";
      import { out } from "@tsonic/csharp/lang.js";
      import * as state from "./state.js";
      import { read } from "./reader.js";
      export function run(): boolean {
        if (!Int32.TryParse("42", out(state.parsed))) return false;
        if (read() !== 42 || state.spare !== 7) return false;
        if (Int32.TryParse("invalid", out(state.parsed))) return false;
        return read() === 0 && state.spare === 7;
      }
    `,
    files: {
      "state.ts": `import type { int32 } from "@tsonic/core/types.js";
        export let [parsed, spare] = [0 as int32, 7 as int32];`,
      "reader.ts": `import { parsed } from "./state.js";
        export function read() { return parsed; }`,
    },
  });
  executeCsharpConstruction(compiled, "destructured-namespace-module-byref");
  assert.match(compiled.artifacts.get("src/State.cs"), /public static int parsed =/u);
  assert.match(compiled.artifacts.get("src/State.cs"), /public static int spare\s*\{\s*get;/u);
  assert.match(compiled.artifacts.get("src/Index.cs"), /TryParse\("42", out global::Tsonic\.Generated\.State\.parsed\)/u);
  assert.match(compiled.artifacts.get("src/Index.cs"), /TryParse\("invalid", out global::Tsonic\.Generated\.State\.parsed\)/u);
  assert.match(compiled.artifacts.get("src/Reader.cs"), /return global::Tsonic\.Generated\.State\.parsed;/u);
  assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /State\.parsed(?:!|\.Value)|copy.?back/iu);
});

function sourceArtifacts(compiled) {
  const artifacts = Object.fromEntries(compiled.artifacts);
  const project = artifacts["TsonicGenerated.csproj"];
  assert.match(project, /<OutputType>Library<\/OutputType>/u);
  assert.match(project, /<ProjectReference Include="[^"]+\/csharp\/runtime\/net10\.0\/[a-f0-9]{64}\/Tsonic\.CSharp\.Runtime\.csproj" \/>/u);
  assert.doesNotMatch(project, /Tsonic\.CSharp\.Js/u);
  delete artifacts["TsonicGenerated.csproj"];
  return artifacts;
}
