import assert from "node:assert/strict";
import test from "node:test";
import { csharpJsSurfaceSourceProfileContributions } from "../../../dist/source/profiles/declarations.js";
import { getCsharpDelegateSignature } from "../../../dist/target-model/types/carriers/delegates.js";
import { acceptedEffectiveSource, assertPrimitiveOccurrences, compileEffectiveSource, projectNodes } from "../../helpers/source-effective-types.mjs";

test("every JS-surface array callback index declaration names the existing int32 Source width", () => {
  const declaration = csharpJsSurfaceSourceProfileContributions().declarations.find(row => row.fileName === "js-globals.d.ts");
  assert.equal(declaration !== undefined, true, "the actual C# JS profile owns its declarations");
  const callbacks = declaration.text.split("\n").filter(line => /\b(?:callbackfn|mapfn)\s*:/u.test(line) && /\b(?:index|currentIndex)\s*:/u.test(line));
  assert.equal(callbacks.length >= 21, true, "mutable readonly reduce and Array.from callback declarations are all present");
  for (const row of callbacks) {
    const parameters = [...row.matchAll(/\b(?:index|currentIndex)\s*:\s*(import\("@tsonic\/core\/types\.js"\)\.int32|number)\b/gu)];
    assert.equal(parameters.length === 1 && parameters[0][1] === 'import("@tsonic/core/types.js").int32', true,
      "each actual callback index is declared int32 rather than inferred from a Native profile implementation");
  }
});

for (const readonly of [false, true]) {
  const cases = [
    ["forEach", "values.forEach((value, index) => { void value; void index; });", 1],
    ["map", "void values.map((value, index) => value + index);", 1],
    ["filter", "void values.filter((value, index) => value > index);", 1],
    ["some", "void values.some((value, index) => value > index);", 1],
    ["every", "void values.every((value, index) => value > index);", 1],
    ["find", "void values.find((value, index) => value > index);", 1],
    ["findIndex", "void values.findIndex((value, index) => value > index);", 1],
    ["findLast", "void values.findLast((value, index) => value > index);", 1],
    ["findLastIndex", "void values.findLastIndex((value, index) => value > index);", 1],
    ...(readonly ? [] : [
      ["reduce", "void values.reduce((accumulator, value, index) => accumulator + value + index);", 2],
      ["reduce with seed", "void values.reduce((accumulator, value, index) => accumulator + value + index, 0);", 2],
    ]),
  ];
  for (const [name, body, indexPosition] of cases) {
    test(`js ${readonly ? "readonly" : "mutable"} ${name} keeps its declared index identical to the Native callback ABI`, () => {
      const compiled = compileEffectiveSource("js", `import type { int32 } from "@tsonic/core/types.js";
        export function run(values: ${readonly ? "readonly " : ""}int32[]): void { ${body} }
      `);
      acceptedEffectiveSource(compiled);
      assertPrimitiveOccurrences(compiled, "index", "int32");
      const arrows = projectNodes(compiled, (node, ast) => ast.is.IsArrowFunction(node));
      assert.equal(arrows.length, 1, "one original inline callback is retained");
      const arrow = arrows[0];
      const ast = compiled.targetSource.ast;
      const selected = compiled.targetSource.semantics.forNode(arrow).operations.call(ast.parent(arrow));
      const declaration = selected?.sourceSelectedSignatureParameters[0]?.parameterDeclaration;
      const callback = declaration === undefined ? undefined : ast.typeNode(declaration);
      const index = callback === undefined ? undefined : ast.parameters(callback)[indexPosition];
      const annotation = index === undefined ? undefined : ast.typeNode(index);
      assert.equal(annotation !== undefined, true, "the actual selected Source declaration supplies the callback index annotation");
      const range = ast.authoredRange(annotation);
      const text = range.kind === "authored" ? ast.getSourceText(ast.getSourceFile(annotation)).slice(range.start, range.end) : undefined;
      assert.equal(text, 'import("@tsonic/core/types.js").int32');
      const signature = getCsharpDelegateSignature(compiled.result.program.records.callableTarget.get(arrow));
      const contract = compiled.result.program.records.callableDeclaration.get(arrow)?.contract;
      const native = contract?.nativeParameters[indexPosition]?.targetParameter.type;
      assert.equal(signature?.parameters[indexPosition]?.name === "int32" && native?.name === "int32", true,
        "the emitted callback signature and its selected ABI agree with the declaration without a width override");
    });
  }
}
