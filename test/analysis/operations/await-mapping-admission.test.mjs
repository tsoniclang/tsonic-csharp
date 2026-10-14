import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (!url.endsWith("/dist/target-model/types/await-completions.js")) return loaded;
    const marker = "export function selectCsharpAwaitCompletion(";
    const source = String(loaded.source);
    assert.equal(source.includes(marker), true, "the await completion selector is the injection point");
    return { ...loaded, shortCircuit: true, source: source.replace(marker, "function selectedCsharpAwaitCompletion(") +
      "\nexport function selectCsharpAwaitCompletion(carrier, definitions) {\n" +
      "  const completion = selectedCsharpAwaitCompletion(carrier, definitions);\n" +
      "  return completion === undefined || globalThis.staleAwaitResultMapping === undefined\n" +
      "    ? completion : globalThis.staleAwaitResultMapping(completion);\n}\n" };
  },
});

const { createTargetSourceProgram } = await import("@tsonic/target-api/source");
const { compileCsharpSource } = await import("../../helpers/direct-csharp-session.mjs");

const sourceText = `
  export async function settle(pending: Promise<string | number> | Promise<boolean>): Promise<string | number | boolean> {
    return await pending;
  }
`;
const correspondence = "Union conversion requires exact sealed arm coverage and native absence correspondence.";

function reversedMappings(completion) {
  return { ...completion, alternatives: completion.alternatives.map(alternative => alternative.resultMapping === undefined
    ? alternative
    : { ...alternative, resultMapping: { ...alternative.resultMapping, arms: [...alternative.resultMapping.arms].reverse() } }) };
}

function compile(surface, stale) {
  globalThis.staleAwaitResultMapping = stale;
  try {
    return compileCsharpSource({ sourceText, surface });
  } finally {
    globalThis.staleAwaitResultMapping = undefined;
  }
}

for (const surface of ["native", "js"]) {
  test(`a stale await result mapping is rejected at operation admission before publication in ${surface}`, () => {
    const result = compile(surface, reversedMappings);
    assert.deepEqual(result.targetDiagnostics.map(({ code, message }) => ({ code, message })),
      [{ code: "CSHARP_AWAIT_RESULT_MAPPING_NOT_PROVEN", message: correspondence }]);
    const [diagnostic] = result.result.diagnostics;
    const ast = createTargetSourceProgram(result.source).ast;
    assert.equal(diagnostic.sourceNode !== undefined && ast.is.IsAwaitExpression(diagnostic.sourceNode), true,
      "the issue names the await expression");
    assert.equal(sourceText.slice(ast.pos(diagnostic.sourceNode), ast.end(diagnostic.sourceNode)).trim(), "await pending");
    assert.equal(result.result.program === undefined, true, "no program is published");
    assert.equal(result.result.plan === undefined, true, "nothing is planned");
    assert.equal(result.artifacts.size, 0, "nothing is emitted");
  });

  test(`valid await result mappings are admitted unchanged in ${surface}`, () => {
    const result = compile(surface, undefined);
    assert.deepEqual(result.targetDiagnostics, []);
    const { program } = result.result;
    const mappings = [];
    const pending = [...program.sourceFiles];
    while (pending.length > 0) {
      const node = pending.pop();
      for (const alternative of program.records.awaitCompletion.get(node)?.alternatives ?? []) {
        if (alternative.resultMapping !== undefined) mappings.push(alternative.resultMapping);
      }
      program.source.ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
    }
    assert.equal(mappings.length, 1);
    assert.deepEqual(Object.keys(mappings[0]).sort(), ["arms", "coverage", "kind"]);
    assert.equal(mappings[0].kind, "union-map");
    assert.equal(mappings[0].coverage, "source");
    assert.equal(result.artifacts.size > 0, true);
    assert.equal(Object.hasOwn(program, "conversions"), false, "the old conversion service stays absent");
  });
}
