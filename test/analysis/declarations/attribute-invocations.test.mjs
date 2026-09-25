import assert from "node:assert/strict";
import test from "node:test";
import { checkCsharpSource, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

test("C# attributes reuse the selected constructor overload and emit no annotation callback", () => {
  const compiled = compileCsharpSource({ sourceText: `
    import { attribute as annotate } from "@tsonic/core/lang.js";
    import { ObsoleteAttribute as Obsolete, SerializableAttribute } from "@tsonic/dotnet/System.js";
    export class Subject { run(): void {} }
    annotate<Subject>().add(() => new SerializableAttribute());
    annotate<Subject>().add(() => new Obsolete("old", false));
    annotate<Subject>().method(subject => subject.run).add(() => new Obsolete("method"));
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const output = compiled.result.artifacts.filter(artifact => artifact.path.endsWith(".cs"))
    .map(artifact => artifact.text).join("\n");
  assert.match(output, /\[System\.SerializableAttribute\]/u);
  assert.match(output, /\[System\.ObsoleteAttribute\("old", false\)\]/u);
  assert.match(output, /\[System\.ObsoleteAttribute\("method"\)\]/u);
  assert.doesNotMatch(output, /=>|new System\.(?:Obsolete|Serializable)Attribute|\bannotate\b|__tsonic_module_init/u);
});

for (const invocation of [
  "() => new ObsoleteAttribute(7)",
  '() => new ObsoleteAttribute("old", "false")',
  '() => new ObsoleteAttribute("old", false, true)',
  "ObsoleteAttribute",
  'ObsoleteAttribute, "old"',
]) {
  test(`C# checks attribute arguments before target lowering: ${invocation}`, () => {
    const checked = checkCsharpSource({ sourceText: `
      import { attribute } from "@tsonic/core/lang.js";
      import { ObsoleteAttribute } from "@tsonic/dotnet/System.js";
      class Subject {}
      attribute<Subject>().add(${invocation});
    ` });
    assert.notEqual(checked.sourceDiagnosticsText, "");
  });
}

test("C# rejects a checked ordinary call instead of interpreting it as an attribute constructor", () => {
  const compiled = compileCsharpSource({ sourceText: `
    import { attribute } from "@tsonic/core/lang.js";
    import { SerializableAttribute } from "@tsonic/dotnet/System.js";
    class Subject {}
    function factory(): SerializableAttribute { return new SerializableAttribute(); }
    attribute<Subject>().add(() => factory());
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.ok(compiled.targetDiagnostics.some(diagnostic => diagnostic.code === "CSHARP_ATTRIBUTE_CONSTRUCTION_REQUIRED"));
  assert.deepEqual(compiled.result.artifacts, []);
});
