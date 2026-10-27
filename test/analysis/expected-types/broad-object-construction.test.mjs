import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

const sourceText = `
let order: string = "";
function mark(label: string, value: number): number { order = order + label; return value; }
export function trace(): string { return order; }
export function nested(): unknown { return { value: 1, child: { label: "ready" } }; }
export function ordered(): unknown {
  return { first: mark("a", 1), child: { second: mark("b", 2) }, last: mark("c", 3) };
}
export class Box { value: number = 7; }
export function aliased(): unknown {
  const box = new Box();
  return { first: box, second: box };
}
`;

for (const surface of ["native", "js"]) {
  test(`fresh broad object construction seals ordered native value members on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "the checked program publishes its admitted records");
    const ast = program.source.ast;
    const literals = [];
    const visit = node => {
      if (ast.is.IsObjectLiteralExpression(node)) literals.push(node);
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    assert.equal(literals.length, 5, "both nested literals and the alias container are checked");
    for (const node of literals) {
      const use = program.records.nativeExpression.get(node)?.physical;
      assert.equal(use !== undefined && use.kind !== "erased" && use.dynamicObject !== undefined &&
        use.objectShape === undefined, true, "fresh broad construction carries a sealed member plan, not a synthetic shape");
      assert.equal(Object.isFrozen(use.dynamicObject), true, "the selected authored member order is immutable");
      assert.equal(use.dynamicObject.every(member => Object.isFrozen(member)), true,
        "each selected member retains immutable checked name and initializer evidence");
    }
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal((output.match(/\.CreateDynamicObject\(/gu) ?? []).length, 5,
      "one direct native construction is emitted for each fresh literal");
    assert.equal(/\bObjectShape_[a-f0-9]+\b|System\.Reflection|\bdynamic\b/u.test(output), false,
      "fresh broad literals require neither a boxed intermediate shape nor reflective access");
    assert.equal(/CreateDynamicObject\("value",[^;]*CreateDynamicObject\("label",/u.test(output), true,
      "the nested literal remains directly nested when no ordered prelude is required");
    executeCsharpConstruction(compiled, `broad-object-construction-${surface}`, false, false, [], `
var nested = Tsonic.Generated.Index.nested();
if (System.Convert.ToInt64(nested.ReadDynamicSlot("value").unwrap()) != 1 ||
    nested.ReadDynamicSlot("child").ReadDynamicSlotAs<string>("label") != "ready")
    throw new System.Exception("nested native values");
var ordered = Tsonic.Generated.Index.ordered();
if (Tsonic.Generated.Index.trace() != "abc" ||
    System.Convert.ToInt64(ordered.ReadDynamicSlot("last").unwrap()) != 3)
    throw new System.Exception("initializer order and exactly-once effects");
var aliased = Tsonic.Generated.Index.aliased();
if (!object.ReferenceEquals(aliased.ReadDynamicSlot("first").unwrap(), aliased.ReadDynamicSlot("second").unwrap()))
    throw new System.Exception("stored native alias identity");
`);
  });
}

test("method-only typed literals retain their selected native object representation", () => {
  const compiled = compileCsharpSource({ sourceText: `
export function run(): boolean {
  const value: { read(): number } = { read(): number { return 7; } };
  return value.read() === 7;
}` });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal(output.includes("CreateDynamicObject("), false,
    "an authored native method body is not discarded into a broad data-only construction");
  executeCsharpConstruction(compiled, "broad-object-native-method-control");
});
