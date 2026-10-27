import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { memoryAbiCapability } from "../../helpers/memory-abi.mjs";
import { explicitErrorStackSource, invalidErrorStackSources } from "../../../../tsonic/test/fixtures/explicit-error-stacks.mjs";
import { sourceClassAnnotationSource, invalidSourceClassAnnotations } from "../../../../tsonic/test/fixtures/source-class-annotations.mjs";
import { boundMemoryRecordProofFiles } from "../../../../tsonic/test/fixtures/bound-memory-records.mjs";
import { numberArrayUnionFiles } from "../../../../tsonic/test/fixtures/number-array-unions.mjs";
import { frozenObjectSources } from "../../../../tsonic/test/fixtures/frozen-objects.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of Array.from([undefined, "js"]).slice(0, 2)) {
const profile = surface ?? "native";

test(`explicit Error stacks execute without implicit capture (${profile})`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: explicitErrorStackSource }), `explicit-error-stack-${profile}`);
    for (const sourceText of invalidErrorStackSources) {
      const compiled = compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText });
      assert.match(compiled.sourceDiagnosticsText, /error TS/u);
    }
  });

test(`abstract declarations and readonly annotations preserve native dispatch (${profile})`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: sourceClassAnnotationSource }), `class-annotations-${profile}`);
    for (const { source: sourceText, code } of invalidSourceClassAnnotations) {
      const compiled = compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText });
      assert.ok(compiled.sourceDiagnosticsText.includes(code), compiled.sourceDiagnosticsText);
    }
  });
}

test("numeric array presence preserves initialized elements, boundary keys and evaluation order", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
let order = "";
const values = new Array<number>(2);
values[1] = 0;
function index(): number { order += "i"; return 1; }
function array(): number[] { order += "a"; return values; }
export function run(): boolean {
  const present = index() in array();
  return present && order === "ia" && 0 in values && -0 in values && values[0] === 0 &&
    !(-1 in values) && !(0.5 in values) && !(2 in values) && !(Number.POSITIVE_INFINITY in values) && !(Number.NaN in values);
}` }), "numeric-array-presence");
});

for (const [name, source] of Array.from(Object.entries(frozenObjectSources)).slice(0, 4)) {
test(`frozen reference objects preserve ${name}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `${source}\nexport function run(): boolean { main(); return true; }` }), `frozen-${name}`);
  });
}
