import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

for (const surface of ["native", "js"]) {
  test(`nested bindings consume the actual extracted member carrier through contextual, aliased and cross-file producers on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, files: {
      "producer.ts": `
export type Inner = { value: number };
export function create(value: number): Inner { return { value }; }
`,
    }, sourceText: `
import { create } from "./producer.js";
import type { Inner } from "./producer.js";
export function contextual(): number {
  const owner: { inner: Inner } = { inner: { value: 7 } };
  const { inner: { value } } = owner;
  return value;
}
export function replaced(): number {
  const owner: { inner: Inner } = { inner: { value: 7 } };
  const alias = owner;
  alias.inner = create(11);
  const { inner: { value } } = owner;
  return value;
}
export function multiple(flag: boolean): number {
  const owner: { inner: Inner } = { inner: flag ? create(13) : create(17) };
  const { inner: { value } } = owner;
  return value;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "admitted nested extractions publish one physical contract");
    const ast = program.source.ast;
    let nested = 0;
    const visit = node => {
      if (ast.is.IsBindingElement(node)) {
        const declaration = ast.as.AsBindingElement(node);
        const fact = program.records.bindingPatternProjection.get(node);
        if (declaration?.name !== undefined && ast.is.IsObjectBindingPattern(declaration.name) &&
          fact?.element?.kind === "object-shape-member") {
          nested += 1;
          assert.equal(fact.binding !== undefined &&
            targetTypeRefKey(fact.binding.source) === targetTypeRefKey(fact.element.member.type), true,
          "the nested conversion starts from the selected physical field, never its declaration initializer");
        }
      }
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    assert.equal(nested, 3, "all contextual, replacement and multiple-producer extractions are checked");
    executeCsharpConstruction(compiled, `nested-binding-carriers-${surface}`, false, false, [], `
if (Tsonic.Generated.Index.contextual() != 7 || Tsonic.Generated.Index.replaced() != 11 ||
    Tsonic.Generated.Index.multiple(true) != 13 || Tsonic.Generated.Index.multiple(false) != 17)
    throw new System.Exception("nested extraction uses the current physical field");
`);
  });
}
