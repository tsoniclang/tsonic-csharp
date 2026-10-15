import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { closedInstanceFiles, closedNativeInstanceSource } from "../../../../tsonic/test/fixtures/closed-instance-tests.mjs";

for (const surface of [undefined, "js"]) {
  test(`closed nominal union tests preserve inheritance, absence and effects on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: closedInstanceFiles["index.ts"],
      files: { "models.ts": closedInstanceFiles["models.ts"] } }), "closed-instance-tests");
  });
}

test("selected native constructors test closed payloads without copying them", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: closedNativeInstanceSource });
  const output = compiled.artifacts.get("src/Index.cs");
  assert.ok(output);
  const start = output.indexOf("public static bool pattern(");
  const end = output.indexOf("public static bool match(");
  assert.ok(start >= 0 && end > start);
  const pattern = output.slice(start, end);
  assert.match(pattern, /\.As2\(\) is Tsonic\.CSharp\.Js\.RegExp/u);
  assert.doesNotMatch(pattern, /\(object\?\)value\b|\bnew\b|\.Clone\(|\.ToArray\(/u);
  executeCsharpConstruction(compiled, "closed-native-instance-tests");
});
