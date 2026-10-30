import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, withCsharpSessionRequest } from "../../helpers/direct-csharp-session.mjs";

for (const surface of ["native", "js"]) {
  test(`${surface}: native method literals retain the shorthand parameter's exact checked value binding`, () => {
    const { compiled } = withCsharpSessionRequest({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
type Payload = { extra: int32; run(value: int32): int32 };
export function make(extra: int32): Payload { return { extra, run(value: int32): int32 { return this.extra + value; } }; }
export function call(value: Payload, input: int32): int32 { return value.run(input); }
export function extract(value: Payload): (input: int32) => int32 { return value.run; }
export function copy(value: Payload): Payload { return { ...value }; }
` }, request => {
      const source = request.input.source;
      const nodes = source.navigation.nodes;
      const parameters = nodes.filter(node => source.ast.is.IsParameter(node) && source.ast.text(source.ast.name(node)) === "extra");
      const shorthands = nodes.filter(node => source.ast.is.IsShorthandPropertyAssignment(node));
      assert.equal(parameters.length, 1, "the original native int32 parameter is unique");
      assert.equal(shorthands.length, 1, "the original shorthand value read is unique");
      const name = source.ast.name(shorthands[0]);
      assert.equal(name !== undefined, true, "the shorthand's own name is preserved");
      const reference = source.navigation.sourceReferenceFor(name);
      assert.equal(reference !== undefined && reference.declaration === parameters[0], true,
        "the native value comes from its actual checked parameter, never the destination property");
      assert.equal(source.navigation.referenceFor(name)?.declaration === parameters[0], true,
        "the ordinary selected reference retains the same parameter identity");
    });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.equal(emitted.includes("make(int extra)"), true, "the actual parameter keeps its exact native int32 ABI");
    assert.equal(emitted.includes("double extra"), false, "the shorthand cannot manufacture a floating carrier");
  });
}
