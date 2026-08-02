import assert from "node:assert/strict";
import test from "node:test";
import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

test("direct C# translation assigns deterministic source identities and module initialization dependencies", () => {
  const compiled = cleanCompile({
    sourceText: `
      import { User } from "./models/user.js";
      export function name(user: User): string { return user.name; }
    `,
    files: {
      "models/user.ts": `
        export class User {
          constructor(publicName: string) { this.name = publicName; }
          name: string;
        }
      `,
    },
  });

  assert.deepEqual([...compiled.artifacts.keys()], [
    "TsonicGenerated.csproj",
    "src/models/Models_user.cs",
    "src/Index.cs",
  ]);
  assert.equal(compiled.artifacts.get("src/models/Models_user.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Models_user
    {
        private static readonly System.Lazy<object?> __tsonic_module_initialization = new System.Lazy<object?>(() => __tsonic_module_init_core());
        private static object? __tsonic_module_init_core()
        {
            return null;
        }
        public static void __tsonic_module_init()
        {
            _ = __tsonic_module_initialization.Value;
        }
    }
    public class User
    {
        public User(string publicName)
        {
            this.name = publicName;
        }
        public string name;
    }
}
`);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static string name(User user)
        {
            return user.name;
        }
        private static readonly System.Lazy<object?> __tsonic_module_initialization = new System.Lazy<object?>(() => __tsonic_module_init_core());
        private static object? __tsonic_module_init_core()
        {
            Models_user.__tsonic_module_init();
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

test("direct C# executable translation emits one exact generated entrypoint", () => {
  const compiled = cleanCompile({
    sourceText: `export const message = "ready";`,
    targetOptions: { outputType: "Exe" },
  });

  assert.equal(compiled.artifacts.get("TsonicGenerated.csproj"), `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>disable</ImplicitUsings>
    <OutputType>Exe</OutputType>
  </PropertyGroup>
</Project>
`);
  assert.equal(compiled.artifacts.get("generated/TsonicEntrypoint.cs"), `namespace Tsonic.Generated
{
    public static class TsonicEntrypoint
    {
        public static void Main()
        {
            Index.__tsonic_module_init();
        }
    }
}
`);
});

test("direct C# module bindings remain internally mutable and externally read-only", () => {
  const compiled = cleanCompile({
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      export let count: int = 0;
      export function increment(): int {
        count++;
        return count;
      }
    `,
  });

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static int count
        {
            get;
            private set;
        } = default(int)!;
        public static int increment()
        {
            count++;
            return count;
        }
        private static readonly System.Lazy<object?> __tsonic_module_initialization = new System.Lazy<object?>(() => __tsonic_module_init_core());
        private static object? __tsonic_module_init_core()
        {
            count = 0;
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

test("direct C# translation awaits async module dependencies and project-owned contextual callbacks", () => {
  const compiled = cleanCompile({
    surface: "js",
    targetOptions: { outputType: "Exe" },
    sourceText: [
      "import \"./worker.js\";",
      "export const done = true;",
      "",
    ].join("\n"),
    files: {
      "worker.ts": [
        "export function delay(): Promise<void> {",
        "  return new Promise<void>((resolve) => { resolve(); });",
        "}",
        "await delay();",
        "",
      ].join("\n"),
    },
  });

  assert.equal(compiled.artifacts.get("src/Worker.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Worker
    {
        public static System.Threading.Tasks.Task delay()
        {
            return Tsonic.CSharp.Js.PromiseRuntime.Create((Tsonic.CSharp.Js.PromiseResolve resolve, Tsonic.CSharp.Js.PromiseReject _) =>
            {
                resolve();
            });
        }
        private static readonly System.Lazy<System.Threading.Tasks.Task> __tsonic_module_initialization = new System.Lazy<System.Threading.Tasks.Task>(() => __tsonic_module_init_core());
        private static async System.Threading.Tasks.Task __tsonic_module_init_core()
        {
            await delay();
        }
        public static System.Threading.Tasks.Task __tsonic_module_init()
        {
            return __tsonic_module_initialization.Value;
        }
    }
}
`);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static bool done
        {
            get;
            private set;
        } = default(bool)!;
        private static readonly System.Lazy<System.Threading.Tasks.Task> __tsonic_module_initialization = new System.Lazy<System.Threading.Tasks.Task>(() => __tsonic_module_init_core());
        private static async System.Threading.Tasks.Task __tsonic_module_init_core()
        {
            await Worker.__tsonic_module_init();
            done = true;
        }
        public static System.Threading.Tasks.Task __tsonic_module_init()
        {
            return __tsonic_module_initialization.Value;
        }
    }
}
`);
  assert.equal(compiled.artifacts.get("generated/TsonicEntrypoint.cs"), `namespace Tsonic.Generated
{
    public static class TsonicEntrypoint
    {
        public static async System.Threading.Tasks.Task Main()
        {
            await Index.__tsonic_module_init();
        }
    }
}
`);
});

test("direct C# translation rejects runtime ES module cycles before publishing artifacts", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      import { valueB } from "./b.js";
      export function valueA(): int { return valueB() + 1; }
    `,
    files: {
      "b.ts": `
        import type { int } from "@tsonic/csharp/types.js";
        import { valueA } from "./index.js";
        export function valueB(): int { return valueA() + 1; }
      `,
    },
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.result.diagnostics, [{
    code: "CSHARP_UNSUPPORTED_RUNTIME_MODULE_CYCLE",
    category: "error",
    source: "tsonic-csharp",
    message:
      "Runtime ES module dependency cycle 'index.ts -> b.ts -> index.ts' cannot be lowered to C# module initialization without finalized live-binding and TDZ support.",
    evidence: [
      "TSTS selected a runtime project-source import/export dependency cycle.",
      "C# emission must fail closed rather than reading uninitialized default target values.",
      "Implement provider-backed ESM live bindings/TDZ facts before enabling cyclic runtime module graphs.",
    ],
  }]);
  assert.deepEqual([...compiled.artifacts], []);
});

function cleanCompile(options) {
  const compiled = compileCsharpSource(options);
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.result.diagnostics, []);
  return compiled;
}
