import assert from "node:assert/strict";
import test from "node:test";

import {
  createDotnetReflectionTypeDataProvider,
} from "../../../helpers/dotnet-reflection-provider.mjs";
import {
  checkCsharpSource,
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";
import { getCompleteDotnetModule } from "../../../fixtures/dotnet-provider/dotnet-provider.helpers.mjs";

test(".NET provider source refs use public type-family exports for every concrete arity", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const modules = [
    requireModule(getCompleteDotnetModule(provider, "@tsonic/dotnet/System.js", { requestedExports: ["Int32"] })),
    requireModule(getCompleteDotnetModule(provider, "@tsonic/dotnet/System.Threading.Tasks.js", { requestedExports: ["TaskFactory"] })),
  ];

  const observedPublicFamilies = new Set();
  for (const module of modules) {
    const concreteVariantNames = new Map(module.exports
      .filter((declaration) =>
        declaration.kind === "type" &&
        declaration.sourceTypeFamily !== undefined &&
        declaration.sourceName !== declaration.sourceTypeFamily.exportName)
      .map((declaration) => [declaration.sourceName, declaration.sourceTypeFamily.exportName]));
    const providerRefs = collectProviderRefs(module);
    const illegalConcreteRefs = providerRefs
      .filter((reference) => reference.moduleSpecifier === module.moduleSpecifier && concreteVariantNames.has(reference.exportName))
      .map((reference) => ({
        exportName: reference.exportName,
        expectedPublicExport: concreteVariantNames.get(reference.exportName),
      }));
    assert.deepEqual(illegalConcreteRefs, []);
    for (const reference of providerRefs) {
      if (reference.moduleSpecifier !== module.moduleSpecifier) continue;
      if ([...concreteVariantNames.values()].includes(reference.exportName)) {
        observedPublicFamilies.add(reference.exportName);
      }
    }
  }

  assert.equal(observedPublicFamilies.has("IComparable"), true);
  assert.equal(observedPublicFamilies.has("Task"), true);
  const taskModule = modules[1];
  const taskVariants = taskModule.exports.filter((declaration) =>
    declaration.kind === "type" && declaration.sourceTypeFamily?.exportName === "Task");
  assert.deepEqual(taskVariants.map((declaration) => declaration.sourceTypeFamily.typeArgumentCount).sort(), [0, 1]);
  assert.equal(new Set(taskVariants.map((declaration) => declaration.targetId)).size, 2);
});

test("direct C# translation keeps plain and generic provider-family variants separate", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import type { Span } from "@tsonic/dotnet/System.js";
      import type { Task } from "@tsonic/dotnet/System.Threading.Tasks.js";
      import type { int } from "@tsonic/csharp/types.js";
      export function select(
        plain: Task,
        generic: Task<string>,
      ): Task<string> {
        return generic;
      }
      export function preserveAuthoredTypeArgument(
        value: Span<int>,
      ): Span<int> {
        return value;
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
{
    public static class Index
    {
        public static System.Threading.Tasks.Task<string> select(System.Threading.Tasks.Task plain, System.Threading.Tasks.Task<string> generic)
        {
            return generic;
        }
        public static System.Span<int> preserveAuthoredTypeArgument(System.Span<int> value)
        {
            return value;
        }
    }
}
`);
});

test("plain provider-family variants do not expose generic-only members", () => {
  const checked = checkCsharpSource({
    sourceText: `
      import type { Task } from "@tsonic/dotnet/System.Threading.Tasks.js";
      export function read(plain: Task): unknown {
        return plain.Result;
      }
    `,
  });

  assert.equal(
    checked.sourceDiagnosticsText,
    "/project/index.ts(4,22): error TS2339: Property 'Result' does not exist on type '__TstsProvider_Task_0'.\n",
  );
  assert.deepEqual(checked.extensionDiagnostics, []);
});

function requireModule(result) {
  assert.equal("exports" in result, true, JSON.stringify(result));
  return result;
}

function collectProviderRefs(value, refs = [], visited = new WeakSet()) {
  if (value === null || typeof value !== "object" || visited.has(value)) return refs;
  visited.add(value);
  if (value.kind === "provider-ref") refs.push(value);
  if (Array.isArray(value)) {
    for (const item of value) collectProviderRefs(item, refs, visited);
    return refs;
  }
  for (const nested of Object.values(value)) collectProviderRefs(nested, refs, visited);
  return refs;
}
