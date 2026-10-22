import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { moduleBindingPatternFiles, moduleBindingPublicationPrograms } from "../../../../tsonic/test/fixtures/module-binding-patterns.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

for (const surface of [undefined, "js"]) {
  test(`module initialization selects only exact module binding leaves on ${surface ?? "native"}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
export const { first, nested: { second } } = { first: 1, nested: { second: 2 } };
export const [, third] = [3, 4] as const;
export function read(): number {
  const { local } = { local: 5 };
  return first + second + third + local;
}
` });
    assert.equal(compiled.result.diagnostics.length, 0,
      compiled.result.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join("\n").slice(0, 4096));
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "the complete checked binding class seals");
    const { ast } = program.source;
    const bindings = new Map();
    const omitted = [];
    const patterns = [];
    const visit = node => {
      if (ast.is.IsBindingElement(node)) {
        const name = ast.as.AsBindingElement(node)?.name;
        if (name === undefined) omitted.push(node);
        else if (ast.is.IsIdentifier(name)) bindings.set(ast.text(name), node);
        else patterns.push(node);
      }
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    for (const sourceFile of csharpProgramSourceFiles(program)) visit(sourceFile);
    for (const [name, mode] of [["first", "value"], ["second", "value"], ["third", "value"], ["local", undefined]]) {
      const binding = bindings.get(name);
      assert.equal(binding !== undefined, true, `the actual ${name} source binding exists`);
      assert.equal(program.records.moduleBindingInitialization.get(binding), mode,
        `${name} reads its original module-versus-local initialization mode`);
    }
    assert.equal(omitted.length, 1, "the checked omitted slot remains one original source subject");
    assert.equal(omitted.every(node => program.records.moduleBindingInitialization.get(node) === undefined), true,
      "an omitted slot never creates module storage");
    assert.equal(patterns.length, 1, "the nested aggregate is distinct from its actual identifier leaf");
    assert.equal(patterns.every(node => program.records.moduleBindingInitialization.get(node) === undefined), true,
      "intermediate aggregates never create module fields");
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.equal(/private static[^;{]*__tsonic_destructure/u.test(emitted), false,
      "initializer temporaries are not retained in private static fields");
    assert.equal(/__tsonic_destructure\d+ =/u.test(emitted), true,
      "initializer projections retain their once-only native local temporaries");
    assert.equal(Object.isFrozen(program.records.moduleBindingInitialization), true,
      "the backend receives one sealed initialization lookup");
  });

  test(`module patterns preserve roots, leaves, defaults, exports and live aliases on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, files: moduleBindingPatternFiles,
      sourceText: moduleBindingPatternFiles["index.ts"], targetOptions: { outputType: "Exe" } });
    assert.equal(compiled.result.diagnostics.length, 0,
      compiled.result.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join("\n").slice(0, 4096));
    assert.equal(compiled.result.program !== undefined && compiled.result.plan !== undefined, true,
      "the identical full semantic module class seals and plans");
    executeCsharpConstruction(compiled, `module-binding-patterns-${surface ?? "native"}`);
  });

  test(`invalid module projection is refused before sealing on ${surface ?? "native"}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
let key = "value" as const;
const { [key]: value } = { value: 1 };
export function run(): number { return value; }
` });
    assert.equal(compiled.result.diagnostics.some(issue => issue.category === "error"), true,
      "a nonconstant module projection retains its native source-key refusal");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true,
      "invalid projection cannot be sealed");
    assert.equal(compiled.artifacts.size, 0, "no partial native artifact is emitted");
  });

  for (const [index, program] of moduleBindingPublicationPrograms.entries()) {
    test(`module publication preserves ${program.name} on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, files: program.files,
        sourceText: program.files["index.ts"], targetOptions: { outputType: "Exe" } });
      assert.equal(compiled.result.diagnostics.length, 0,
        compiled.result.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join("\n").slice(0, 4096));
      assert.equal(compiled.result.program !== undefined && compiled.result.plan !== undefined, true,
        "the identical valid source has complete native publication before the seal");
      executeCsharpConstruction(compiled, `module-binding-publication-${index}-${surface ?? "native"}`);
    });
  }
}
