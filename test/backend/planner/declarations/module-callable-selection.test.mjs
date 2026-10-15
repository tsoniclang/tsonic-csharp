import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";

test("closed exported arrows become public methods while first-class identities remain values", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({
    files: {
      "functions.ts": `
        export const direct = (value: string): string => value;
        const renamed = (value: string): string => value;
        export { renamed as alias };
        export const retained = (value: string): string => value;
        export function retain() { return retained; }
      `,
    },
    sourceText: `
      import { direct, alias, retain, retained } from "./functions.js";
      export function run(): boolean {
        return direct("one") === "one" && alias("two") === "two" &&
          retain() === retained && retain()("three") === "three";
      }
    `,
  });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.match(output, /public static string direct\(string value\)/u);
  assert.match(output, /public static string renamed\(string value\)/u);
  assert.match(output, /Func<string, string> retained/u);
  executeCsharpConstruction(compiled, "exported-callable-selection");
});
