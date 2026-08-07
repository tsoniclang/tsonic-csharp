import assert from "node:assert/strict";
import test from "node:test";
import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

test("direct C# translation consumes exact source-core default and struct facts", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      import { defaultValue, field, struct } from "@tsonic/core/lang.js";

      const Point = struct({ x: field<int>(), y: field<int>() });

      export function zero(): int {
        return defaultValue<int>();
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static int zero()
        {
            return default(int)!;
        }
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
    public struct Point
    {
        public int x;
        public int y;
    }
}
`);
});

test("direct C# translation rejects exact source-core flow facts", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      import { mutableBorrow, move, sharedBorrow } from "@tsonic/core/lang.js";

      export function reject(value: int): void {
        sharedBorrow(value);
        mutableBorrow(value);
        move(value);
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(
    compiled.result.diagnostics.map(({ code, message }) => ({ code, message })),
    ["shared-borrow", "mutable-borrow", "move"].map((marker) => ({
      code: "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED",
      message:
        `C# target does not implement source flow marker '${marker}'; this intrinsic requires an explicit target contract and cannot be erased or lowered as an identity call.`,
    })),
  );
  assert.deepEqual([...compiled.artifacts], []);
});
