import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

for (const surface of ["native", "js"]) {
  test(`a dynamically read container does not impose its representation on an untouched nested native payload on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
export function make(): unknown { return { child: { count: 7 as int32 } }; }
export function read(): unknown { const value: any = make(); return value.child; }
` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "the checked constructions are published");
    const ast = program.source.ast;
    const literals = [];
    const visit = node => {
      if (ast.is.IsObjectLiteralExpression(node)) literals.push(node);
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    assert.equal(literals.length, 2, "the container and payload are distinct checked allocations");
    const container = program.records.nativeExpression.get(literals[0])?.physical;
    const payload = program.records.nativeExpression.get(literals[1])?.physical;
    assert.equal(container !== undefined && container.dynamicObject === undefined && container.objectShape !== undefined,
      true, "the checked broad receiver retains its direct native object construction");
    assert.equal(payload !== undefined && payload.dynamicObject === undefined && payload.objectShape !== undefined &&
      payload.objectShape !== container.objectShape, true,
      "syntactic nesting does not impose the container's native field contract on its distinct payload");
    const count = payload.objectShape.members.find(member => member.sourceName === "count");
    assert.equal(count?.type.kind === "source-primitive" && count.type.name === "int32", true,
      "the untouched native payload retains its exact int32 field");
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.equal((generated.match(/new ObjectShape_[a-f0-9]+\b/gu) ?? []).length, 2,
      "the container and payload each have exactly one native allocation");
    assert.equal(/new Tsonic\.CSharp\.Runtime\.TsObject\b|\.CreateDynamicObject\(|\.WriteDynamicSlot\("/u.test(generated), false,
      "neither native construction allocates a dictionary carrier or a copied dynamic projection");
    executeCsharpConstruction(compiled, `nested-dynamic-origins-${surface}`, false, false, [], `
var container = Tsonic.Generated.Index.make();
var first = container.ReadDynamicSlot("child").unwrap();
var second = container.ReadDynamicSlot("child").unwrap();
if (first is not Tsonic.CSharp.Runtime.ITsClosedValueCarrier || !object.ReferenceEquals(first, second))
    throw new System.Exception("native nested payload identity");
if (Tsonic.Generated.Index.read().unwrap() is not Tsonic.CSharp.Runtime.ITsClosedValueCarrier)
    throw new System.Exception("native nested payload survives the checked dynamic boundary");
`);
  });
}

