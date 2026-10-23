import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const [label, declaration, invocation] of [
  ["function", "function deliver(...items: [actual: number, index: number]): void { result = items[0] + items[1]; }", "deliver"],
  ["arrow", "const deliver = (...items: [actual: number, index: number]): void => { result = items[0] + items[1]; };", "deliver"],
  ["function expression", "const deliver = function(this: void, ...items: [actual: number, index: number]): void { result = items[0] + items[1]; };", "deliver"],
  ["object method", "const box = { deliver(...items: [actual: number, index: number]): void { result = items[0] + items[1]; } };", "box.deliver"],
]) {
  test(`a fixed tuple-rest ${label} uses native scalar slots and one original body binding`, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: `
      export function run(): number {
        let result = 0; ${declaration} [7].forEach(${invocation}); return result;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const { ast } = program.source;
    const nodes = [];
    const visit = node => { nodes.push(node); ast.forEachChild(node, visit); };
    csharpProgramSourceFiles(program).forEach(visit);
    const parameter = nodes.find(node => ast.is.IsParameterDeclaration(node) && ast.as.AsParameterDeclaration(node).DotDotDotToken !== undefined);
    const owner = ast.parent(parameter);
    const contract = program.records.callableDeclaration.get(owner).contract;
    assert.equal(contract.parameters.length === 1 && contract.parameters[0] === parameter, true,
      "the authored rest parameter remains one original source Node");
    assert.equal(contract.nativeParameters.length, 2, "the checked finite argument vector has two actual native slots");
    assert.equal(contract.nativeParameters.every(slot => slot.sourceParameter === parameter && slot.targetParameter.paramsArray !== true), true,
      "native slots correlate to the original source parameter and never claim params ValueTuple");
    const entry = program.records.callableParameter.get(parameter);
    assert.equal(entry.incoming.kind === "tuple" && entry.incoming.parameters.length === 2, true,
      "the existing parameter owner seals the native tuple entry layout");
    const output = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(output, /params\s+(?:\(|(?:global::)?System\.ValueTuple)/u,
      "no illegal native tuple params declaration is emitted");
    assert.match(output, /\bitems\s*=\s*\(/u, "the body receives one allocation-free native tuple value");
    executeCsharpConstruction(compiled, `fixed-tuple-rest-${label.replaceAll(" ", "-")}`, false, false, [], `
if (Tsonic.Generated.Index.run() != 7) throw new System.Exception("native fixed tuple-rest entry");
`);
  });
}

test("direct fixed tuple-rest calls and constructors retain every native argument", () => {
  const compiled = compileCsharpSource({ sourceText: `
    class Box {
      readonly value: number;
      constructor(...items: [number, number]) { this.value = items[0] + items[1]; }
    }
    function sum(...items: [number, number]): number { return items[0] + items[1]; }
    export function run(): number { return new Box(3, 4).value + sum(5, 6); }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /params\s+\(/u,
    "the same presealed native slots govern functions and constructors");
  executeCsharpConstruction(compiled, "fixed-tuple-rest-direct", false, false, [], `
if (Tsonic.Generated.Index.run() != 18) throw new System.Exception("native fixed tuple-rest arity");
`);
});

test("the checked source arity refuses a missing fixed tuple-rest argument before output", () => {
  const compiled = compileCsharpSource({ sourceText: `
    function sum(...items: [number, number]): number { return items[0] + items[1]; }
    export function run(): number { return sum(7); }
  ` });
  assert.match(compiled.sourceDiagnosticsText, /Expected 2 arguments/u, "the original checked tuple arity remains authoritative");
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
    "the target does not manufacture an omitted native argument");
});

test("required expanded tuple-rest slots cannot follow an emitted native optional parameter", () => {
  const compiled = compileCsharpSource({ sourceText: `
    function sum(first?: number, ...items: [number, number]): number {
      return (first ?? 0) + items[0] + items[1];
    }
    export function run(): number { return sum(undefined, 3, 4); }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "", "the source argument order is checked before native ABI admission");
  assert.equal(compiled.result.diagnostics.some(issue => issue.code === "CSHARP_UNSUPPORTED_AST" &&
    issue.message === "Required parameters cannot follow C# optional parameters."), true,
    "the existing parameter owner checks required native slots rather than the source rest marker");
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
    "an unsupported native optional-parameter ordering is refused before publication");
});
