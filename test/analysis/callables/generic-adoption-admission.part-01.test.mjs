import assert from "node:assert/strict";
import { csharpSourceDiagnosticLabel } from "../../helpers/source-diagnostic-label.mjs";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { code, identity, nativeEntryCases, nativeEntryInverses, nativeOpaquePayloadCases, nativeConstructorCases, nativeConstructorInverses, sourcePosition, sourceSpan, cases, rejected } from "./generic-adoption-admission.fixtures.mjs";

for (const [name, declarations] of Array.from(nativeEntryCases).slice(0, 52)) {
test("C# native callback entry keeps exact generic adoption: " + name, () => {
    const invocation = name === "finite-callback-alternatives" ? "wrap(promised, true)" : "wrap(promised)";
    const compiled = compileCsharpSource({ surface: "js", sourceText: declarations +
      `\nexport function reject(promised: Promise<number>): void { void ${invocation}; }` });
    rejected(compiled, invocation, "KindCallExpression", "wrap");
  });
}

test("C# native callback ordinary matrix executes every retained entry under one real loop owner", { timeout: 300_000 }, () => {
  const files = Object.fromEntries(nativeEntryCases.map(([name, declarations], index) =>
    [`case${index}.ts`, declarations + (name === "finite-callback-alternatives"
      ? "\nexport async function run(selectFirst: boolean): Promise<number> { return await wrap(7, selectFirst); }"
      : "\nexport async function run(): Promise<number> { return await wrap(7); }")]));
  const sourceText = nativeEntryCases.map((entry, index) => `import { run as run${index} } from "./case${index}.js";`).join("\n") +
    "\n" + nativeEntryCases.flatMap(([name], index) => name === "finite-callback-alternatives"
      ? [`console.log(await run${index}(true));`, `console.log(await run${index}(false));`]
      : [`console.log(await run${index}());`]).join("\n");
  const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" }, sourceText, files });
  assert.equal(compiled.result.diagnostics.length, 0,
    compiled.result.diagnostics.slice(0, 8).map(issue => csharpSourceDiagnosticLabel(compiled.source, issue)).join("\n"));
  const output = executeCsharpConstruction(compiled, "native-callback-entry-matrix", false, false, [], "");
  assert.deepEqual(output.trim().split(/\r?\n/u), nativeEntryCases.flatMap(([name]) =>
    name === "finite-callback-alternatives" ? ["7", "7"] : ["7"]),
    "every synchronous/deferred/aliased/helper/recursive entry preserves the ordinary native payload");
});

for (const [name, sourceText] of Array.from(nativeEntryInverses).slice(0, 5)) {
test("C# native callback non-adoption inverse: " + name, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" }, sourceText });
    assert.equal(compiled.result.diagnostics.length, 0,
      JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
    const output = executeCsharpConstruction(compiled, "native-callback-inverse-" + name, false, false, [], "");
    assert.equal(output.trim(), "7", "only the actual resolver's same-activation payload is adopted");
  });
}
