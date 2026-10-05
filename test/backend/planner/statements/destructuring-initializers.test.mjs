import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCsharpCompilationSucceeded,
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";

for (const surface of ["native", "js"]) {
  for (const [name, pattern, initializer] of [
    ["object", "{ index }", "{ index: 0 }"],
    ["array", "[index]", "[0]"],
    ["nested object", "{ nested: { index } }", "{ nested: { index: 0 } }"],
    ["nested array", "[[index]]", "[[0]]"],
  ]) {
    test(`${surface} ${name} destructuring consumes its exact inferred initializer type`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `
        export function local(): number {
          const ${pattern} = ${initializer};
          return index;
        }
        export function counted(): number {
          let selected = () => -1;
          for (let ${pattern} = ${initializer}; index < 6; index++) {
            selected = () => index;
            index += 1;
          }
          return selected();
        }
      ` });
      assertCsharpCompilationSucceeded(compiled);
      const source = [...compiled.artifacts.values()].join("\n");
      assert.equal(/\bdynamic\b|Activator\.|Unsafe\./u.test(source), false);
      assert.equal(/\bfor\s*\(/u.test(source), true);
      assert.equal(/\b__tsonic_destructure\d+\b/u.test(source), true);
    });
  }
}
