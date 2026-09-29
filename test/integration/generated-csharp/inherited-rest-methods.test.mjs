import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("inherited native rest slots forward the selected array without reassembly", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
class Base<T> {
  collect(...values: T[]): number { return values.length; }
}
class Child<T> extends Base<T> {}
class Override<T> extends Base<T> {
  collect(...values: T[]): number { return values.length + 1; }
}
export function run(): boolean {
  const child = new Child<string>();
  const base: Base<string> = child;
  const override: Base<string> = new Override<string>();
  return child.collect() === 0 && base.collect("a", "b") === 2 &&
    override.collect("c") === 2 && override.collect() === 1;
}
  ` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "inherited-rest-methods");
});
