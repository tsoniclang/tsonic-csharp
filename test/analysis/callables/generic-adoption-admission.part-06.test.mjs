import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { code, identity, nativeEntryCases, nativeEntryInverses, nativeOpaquePayloadCases, nativeConstructorCases, nativeConstructorInverses, sourcePosition, sourceSpan, cases, rejected } from "./generic-adoption-admission.fixtures.mjs";

for (const [name, sourceText] of Array.from(nativeEntryInverses).slice(33, 37)) {
test("C# native callback non-adoption inverse: " + name, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" }, sourceText });
    assert.equal(compiled.result.diagnostics.length, 0,
      JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
    const output = executeCsharpConstruction(compiled, "native-callback-inverse-" + name, false, false, [], "");
    assert.equal(output.trim(), "7", "only the actual resolver's same-activation payload is adopted");
  });
}

for (const [name, declarations, expression] of Array.from(nativeOpaquePayloadCases).slice(0, 3)) {
test("C# native opaque callable input is unresolved, not safe empty: " + name, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: declarations +
      "\nexport function reject(value: Promise<number>): void { void wrap(value); }" });
    const issue = rejected(compiled, "wrap(value)", "KindCallExpression", "wrap");
    const { ast } = compiled.source;
    assert.equal(ast.kindName(issue.sourceNode), "KindCallExpression", "the original resolving operation owns uncertainty");
    assert.equal(Buffer.from(ast.getSourceText(ast.getSourceFile(issue.sourceNode))).subarray(ast.pos(issue.sourceNode), ast.end(issue.sourceNode))
      .toString("utf8").trim(), "wrap(value)", "approved C-1348: the declared instantiation owns adoption");
    assert.equal(compiled.result.program === undefined && compiled.result.artifacts.length === 0, true,
      "an unresolved source adoption publishes no program or artifact");
  });

test("C# ordinary opaque callable input keeps its native value: " + name, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" },
      sourceText: declarations + "\nconsole.log(await wrap(7));" });
    assert.equal(compiled.result.diagnostics.length, 0, JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
    assert.equal(executeCsharpConstruction(compiled, "ordinary-native-opaque-" + name, false, false, [], "").trim(), "7",
      "ordinary Awaited identity does not add a refusal or alter the native callback result");
  });
}

for (const [name, declarations, expression] of Array.from(nativeOpaquePayloadCases).slice(3, 4)) {
test("C# native opaque callable input is unresolved, not safe empty: " + name, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: declarations +
      "\nexport function reject(value: Promise<number>): void { void wrap(value); }" });
    const issue = rejected(compiled, "wrap(value)", "KindCallExpression", "wrap");
    const { ast } = compiled.source;
    assert.equal(ast.kindName(issue.sourceNode), "KindCallExpression", "the original resolving operation owns uncertainty");
    assert.equal(Buffer.from(ast.getSourceText(ast.getSourceFile(issue.sourceNode))).subarray(ast.pos(issue.sourceNode), ast.end(issue.sourceNode))
      .toString("utf8").trim(), "wrap(value)", "approved C-1348: the declared instantiation owns adoption");
    assert.equal(compiled.result.program === undefined && compiled.result.artifacts.length === 0, true,
      "an unresolved source adoption publishes no program or artifact");
  });
}
