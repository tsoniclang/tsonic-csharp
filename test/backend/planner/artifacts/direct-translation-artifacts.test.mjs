import assert from "node:assert/strict";
import test from "node:test";
import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";

test("direct C# translation omits initialization for type-only module dependencies", () => {
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
  assert.equal(compiled.artifacts.get("src/models/Models_user.cs"), `namespace Tsonic.Generated
{
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
  assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
{
    public static class Index
    {
        public static string name(User user)
        {
            return user.name;
        }
    }
}
`);
  assert.equal(compiled.artifacts.has("generated/TsonicModuleInitializer.cs"), false);
});

test("direct C# library translation omits assembly initialization when the module graph has no runtime initialization", () => {
  const compiled = cleanCompile({
    sourceText: `export function answer(): number { return 42; }`,
  });

  assert.equal(compiled.artifacts.has("generated/TsonicModuleInitializer.cs"), false);
});

test("direct C# executable translation emits one exact generated entrypoint", () => {
  const compiled = cleanCompile({
    sourceText: `export const message = "ready";`,
    targetOptions: { outputType: "Exe" },
  });

  const project = compiled.artifacts.get("TsonicGenerated.csproj");
  assert.match(project, /<OutputType>Exe<\/OutputType>/u);
  assert.match(project, /<Reference Include="Tsonic\.CSharp\.Runtime" HintPath="[^"]+\/Tsonic\.CSharp\.Runtime\.dll" \/>/u);
  assert.doesNotMatch(project, /Tsonic\.CSharp\.Js/u);
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

  assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
{
    public static class Index
    {
        public static int count
        {
            get;
            internal set;
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

  assert.equal(compiled.artifacts.get("src/Worker.cs"), `namespace Tsonic.Generated
{
    public static class Worker
    {
        public static System.Threading.Tasks.Task delay()
        {
            return Tsonic.CSharp.Js.PromiseRuntime.Create((Tsonic.CSharp.Js.PromiseResolve resolve, Tsonic.CSharp.Js.PromiseReject _) =>
            {
                resolve(null);
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
  assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
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

test("direct C# executable translation drives timer-backed top-level await through the selected event loop", () => {
  const compiled = cleanCompile({
    surface: "js",
    targetOptions: { outputType: "Exe" },
    sourceText: [
      "function waitForTimer(): Promise<void> {",
      "  return new Promise<void>((resolve) => {",
      "    setTimeout(() => resolve(), 0);",
      "  });",
      "}",
      "await waitForTimer();",
      "export const done = true;",
      "",
    ].join("\n"),
  });

  assert.equal(compiled.artifacts.get("generated/TsonicEntrypoint.cs"), `namespace Tsonic.Generated
{
    public static class TsonicEntrypoint
    {
        public static void Main()
        {
            Tsonic.CSharp.Js.JsEventLoop.Run(Index.__tsonic_module_init());
        }
    }
}
`);
});

test("direct C# library translation rejects asynchronous module initialization without publishing artifacts", () => {
  const compiled = compileCsharpSource({
    surface: "js",
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

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, [{
    code: "CSHARP_ASYNC_LIBRARY_MODULE_INITIALIZATION_UNSUPPORTED",
    category: "error",
    source: "tsonic-csharp",
    message:
      "C# library output cannot preserve TypeScript top-level await during automatic module initialization because CLR module initializers must be synchronous.",
    evidence: [
      "The configured library entry module requires asynchronous initialization.",
      "Generated library members can execute only after the complete entry-module dependency graph has initialized.",
      "Select executable output or remove top-level await from the library module graph.",
    ],
  }]);
  assert.deepEqual([...compiled.artifacts], []);
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
  assert.deepEqual(compiled.targetDiagnostics, [{
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
  assert.deepEqual(compiled.targetDiagnostics, []);
  return compiled;
}
