import assert from "node:assert/strict";
import test from "node:test";
import { createTsonicPlugin as nodejsCapability } from "../../../../csharp-nodejs/dist/index.js";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

const foreignViews = [
  ["direct readonly", "Readonly<RawPointer>", ""],
  ["direct pick", "Pick<RawPointer, keyof RawPointer>", ""],
  ["local readonly alias", "View", "type View = Readonly<RawPointer>;"],
  ["local picked alias", "View", "type View = Pick<RawPointer, keyof RawPointer>;"],
  ["renamed foreign alias", "Readonly<Foreign>", "type Foreign = RawPointer;"],
  ["custom mapped type", "View<RawPointer>", "type View<Value> = { readonly [Key in keyof Value]: Value[Key] };"],
  ["mixed project and foreign origins", "View", "type View = Readonly<RawPointer & { local: string }>;"],
];

for (const surface of [undefined, "js"]) {
  for (const [name, type, declarations] of foreignViews) {
    test(`unrepresented foreign fields reject ${name} (${surface ?? "native"})`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `
        import type { RawPointer } from "@tsonic/core/types.js";
        ${declarations}
        export function pass(value: ${type}): ${type} { return value; }
      ` });
      assertCsharpCheckingSucceeded(compiled);
      assert.equal(compiled.targetDiagnostics.length > 0, true, "missing native field ownership rejects");
      assert.equal(compiled.targetDiagnostics.every(diagnostic => diagnostic.code === "CSHARP_UNSUPPORTED_AST"),
        true, "the existing unsupported-shape boundary remains authoritative");
      assert.equal(compiled.artifacts.size, 0, "no executable or synthetic marker-field output is published");
    });
  }

  test(`cross-file transformed opaque declarations reject (${surface ?? "native"})`, () => {
    const compiled = compileCsharpSource({ surface, files: {
      "foreign-view.ts": `import type { RawPointer } from "@tsonic/core/types.js";
        export type View<Value> = { readonly [Key in keyof Value]: Value[Key] };
        export type AddressView = View<RawPointer>;`,
    }, sourceText: `
      import type { AddressView as Selected } from "./foreign-view.js";
      export function pass(value: Selected): Selected { return value; }
    ` });
    assertCsharpCheckingSucceeded(compiled);
    assert.equal(compiled.targetDiagnostics.length > 0, true, "an imported project alias cannot own foreign fields");
    assert.equal(compiled.artifacts.size, 0, "cross-file failure remains atomic");
  });

}

test("native provider utility projections retain represented foreign member declarations", () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: `
    import type { Stats } from "node:fs";
    type Selected = Readonly<Pick<Stats, "size">>;
    export function read(value: Selected): number { return value.size; }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.match(output, /return value\.size;/u);
  assert.doesNotMatch(output, /__tsonicSourceType|System\.Reflection/u);
});
