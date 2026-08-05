import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

test("direct C# translation initializes undefined storage and closes recursive local callables", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      export function choose(flag: boolean): string | undefined {
        let value: string | undefined;
        if (flag) value = "yes";
        return value;
      }
      export function walk(values: string[]): number {
        let count = 0;
        const visit = (index: number): void => {
          if (index >= values.Length) return;
          count++;
          visit(index + 1);
        };
        visit(0);
        return count;
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
        public static string? choose(bool flag)
        {
            string? value = null;
            if (flag)
            {
                value = "yes";
            }
            return value;
        }
        public static double walk(string[] values)
        {
            double count = 0;
            Action<double> visit = default(Action<double>)!;
            visit = (double index) =>
            {
                if (index >= values.Length)
                {
                    return;
                }
                count++;
                visit(index + 1);
            };
            visit(0);
            return count;
        }
    }
}
`);
});
