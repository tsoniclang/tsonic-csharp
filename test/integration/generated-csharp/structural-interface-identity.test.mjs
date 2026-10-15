import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`equivalent structural C# record views never inherit their own canonical contract on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      function parse(value: string): { value: string; quality: number } | null {
        return { value, quality: 3 };
      }
      function read(input: { quality: number; value: string }): number { return input.quality; }
      export function run(): boolean {
        const selected = parse("selected");
        if (selected === null) return false;
        const values: Array<{ value: string; quality: number }> = [selected];
        values[0].quality = 4;
        return read(selected) === 4 && values[0].value === "selected";
      }
    ` });
    executeCsharpConstruction(compiled, `structural-interface-identity-${surface ?? "native"}`);
  });
}
