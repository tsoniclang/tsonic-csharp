import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { assertCanonicalAnyRefusal } from "../../helpers/source-any-refusals.mjs";

for (const surface of ["native", "js"]) {
  test(`a dynamically read container does not impose its representation on an untouched nested native payload on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
export function make(): unknown { return { child: { count: 7 as int32 } }; }
export function read(): unknown { const value: any = make(); return value.child; }
` });
    assertCanonicalAnyRefusal(compiled);
  });

  test(`typed nested-container companion preserves native payload storage and identity on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
interface Child { count: int32; }
interface Container { child: Child; }
export function make(): Container { return { child: { count: 7 as int32 } }; }
export function read(): Child { return make().child; }
export function child(value: Container): Child { return value.child; }
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
    assert.equal(container !== undefined && container.kind !== "erased" && container.dynamicObject === undefined &&
      container.objectShape !== undefined, true, "the typed container retains its own native member storage");
    assert.equal(payload !== undefined && payload.kind !== "erased" && payload.dynamicObject === undefined &&
      payload.objectShape !== undefined, true, "syntactic nesting does not create a dynamic receiver obligation");
    const count = payload.objectShape.members.find(member => member.sourceName === "count");
    assert.equal(count?.type.kind === "source-primitive" && count.type.name === "int32", true,
      "the untouched native payload retains its exact int32 field");
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(generated, /TsObject|CreateDynamicObject\(|ReadDynamicSlot|WriteDynamicSlot\(|System\.Reflection|\bdynamic\b/u,
      "neither the typed container nor its exact int32 payload acquires dynamic storage or access");
    executeCsharpConstruction(compiled, `typed-nested-dynamic-origins-${surface}`, false, false, [], `
var container = Tsonic.Generated.Index.make();
var first = container.child;
var second = container.child;
if (first.count != 7 || !object.ReferenceEquals(first, second) ||
    !object.ReferenceEquals(first, Tsonic.Generated.Index.child(container)))
    throw new System.Exception("native nested payload identity");
if (Tsonic.Generated.Index.read().count != 7)
    throw new System.Exception("native nested payload survives the checked typed boundary");
`);
  });
}
