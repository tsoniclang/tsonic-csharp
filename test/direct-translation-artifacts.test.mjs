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
        static Models_user()
        {
        }
        public static void __tsonic_module_init()
        {
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
        static Index()
        {
            Models_user.__tsonic_module_init();
        }
        public static void __tsonic_module_init()
        {
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
