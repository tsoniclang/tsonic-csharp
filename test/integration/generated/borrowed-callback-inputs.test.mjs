import assert from "node:assert/strict";
import test from "node:test";
import { borrowedCallbackInputSource } from "../../../../tsonic/test/fixtures/borrowed-callback-inputs.mjs";
import { assertCsharpCheckingSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { compileCsharpNativeUseSource } from "../../helpers/expected-native-uses.mjs";

for (const surface of [undefined, "js"]) {
  test(`selected callback inputs preserve native repeated mutation and readonly aliases (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpNativeUseSource({ surface, sourceText: borrowedCallbackInputSource });
    assertCsharpCheckingSucceeded(compiled);
    const expected = surface === "js"
      ? "No exact C# implicit conversion relates 'target:Tsonic.CSharp.Js.JSArray`1<source:int64>' to 'target:Tsonic.CSharp.Js.JSArray`1<source:float64>'."
      : "No exact C# implicit conversion relates 'array:1:source:int64' to 'array:1:source:float64'.";
    const ast = compiled.nativeStage.source.ast;
    const calls = compiled.nativeStage.diagnostics.map(issue => {
      const range = issue.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
      const owner = issue.sourceNode === undefined ? undefined : ast.parent(issue.sourceNode);
      const ownerRange = owner === undefined ? undefined : ast.authoredRange(owner);
      const source = issue.sourceNode === undefined ? undefined : ast.getSourceText(ast.getSourceFile(issue.sourceNode));
      assert.equal(issue.code === "CSHARP_UNSUPPORTED_AST" && issue.message === expected &&
        range?.kind === "authored" && source.slice(range.start, range.end) === "values", true,
        "the original int64-array mismatch is refused at its argument with both exact native carriers");
      return ownerRange?.kind === "authored" ? source.slice(ownerRange.start, ownerRange.end).split("(")[0] : undefined;
    });
    assert.deepEqual(calls.sort(), ["observe", "twice"], "both original calls retain their own exact local refusal");
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
      "a rejected physical array conversion publishes no program, copy or retargeted storage");
  });

  for (const [variant, sourceText] of [
    ["declared", borrowedCallbackInputSource.replace("const values = [1, 2];", "const values: number[] = [1, 2];")],
    ["written", borrowedCallbackInputSource.replace("const values = [1, 2];", "const values = [1.0, 2.0];")],
  ]) test(`selected ${variant} floating callback inputs preserve native repeated mutation and readonly aliases (${surface ?? "native"})`,
    { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText });
      executeCsharpConstruction(compiled, `borrowed-callback-inputs-${variant}-${surface ?? "native"}`);
      const source = compiled.artifacts.get("src/Index.cs");
      assert.doesNotMatch(source, /\.ToArray\(|\.ToList\(|Array\.Copy\(|\.Clone\(/u,
        "the declared/written native floating storage reaches both callbacks without an array copy");
    });

  test(`native integer defaults and division preserve exact values on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class Counter { count = 3; floating = 3.0; declared: number = 3; }
      export function run(): boolean {
        const wide = 9007199254740993;
        const values = [1, 2];
        const counter = new Counter();
        let local = 42;
        local += 1;
        const quotient = 5 / 2;
        const floating = 5 / 2.0;
        return wide === 9007199254740993 && values[0] === 1 && values[1] === 2 &&
          counter.count === 3 && local === 43 && quotient === 2 && floating === 2.5;
      }
    ` });
    executeCsharpConstruction(compiled, `integer-defaults-${surface ?? "native"}`);
    const source = compiled.artifacts.get("src/Index.cs");
    assert.equal(/long\s+wide\s*=\s*9007199254740993L/u.test(source) && /long\s+count\s*=/u.test(source) &&
      /long\s+local\s*=\s*42L/u.test(source) && /long\s+quotient\s*=\s*5L\s*\/\s*2L/u.test(source) &&
      /double\s+floating\s*=/u.test(source) && /double\s+declared\s*=/u.test(source), true,
      "local/property integers retain int64 while written and declared floating properties retain double");
  });

  test(`a later floating assignment cannot retarget an integer local on ${surface ?? "native"}`, () => {
    const compiled = compileCsharpNativeUseSource({ surface, sourceText: `
      export function run(): number { let value = 42; value = 1.5; return value; }
    ` });
    assertCsharpCheckingSucceeded(compiled);
    const issue = compiled.nativeStage.diagnostics[0];
    const ast = compiled.nativeStage.source.ast;
    const range = issue?.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
    const source = issue?.sourceNode === undefined ? undefined : ast.getSourceText(ast.getSourceFile(issue.sourceNode));
    assert.equal(compiled.targetDiagnostics.length === 1 && issue.code === "CSHARP_UNSUPPORTED_AST" &&
      issue.message === "No exact C# implicit conversion relates 'source:float64' to 'source:int64'." &&
      range?.kind === "authored" && source.slice(range.start, range.end) === "1.5", true,
      "the incompatible later assignment is refused at its source without changing the original int64 storage");
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
      "the rejected assignment publishes no converted or retargeted native program");
  });
}
