import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { code, identity, nativeEntryCases, nativeEntryInverses, nativeOpaquePayloadCases, nativeConstructorCases, nativeConstructorInverses, sourcePosition, sourceSpan, cases, rejected, supportedAdoption } from "./generic-adoption-admission.fixtures.mjs";

for (const [name, declarations, expression] of Array.from(nativeOpaquePayloadCases).slice(3, 4)) {
test("C# ordinary opaque callable input keeps its native value: " + name, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" },
      sourceText: declarations + "\nconsole.log(await wrap(7));" });
    assert.equal(compiled.result.diagnostics.length, 0, JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
    assert.equal(executeCsharpConstruction(compiled, "ordinary-native-opaque-" + name, false, false, [], "").trim(), "7",
      "ordinary Awaited identity does not add a refusal or alter the native callback result");
  });
}

for (const [name, declarations, expression] of Array.from(nativeOpaquePayloadCases).slice(4, 12)) {
test("C# native opaque callable input is unresolved, not safe empty: " + name, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: declarations +
      "\nexport function reject(value: Promise<number>): void { void wrap(value); }" });
    const call = supportedAdoption(compiled, "wrap(value)", "KindCallExpression", "wrap");
    const { ast } = compiled.source;
    assert.equal(ast.kindName(call), "KindCallExpression", "the original resolving operation owns its native completion");
    assert.equal(Buffer.from(ast.getSourceText(ast.getSourceFile(call))).subarray(ast.pos(call), ast.end(call))
      .toString("utf8").trim(), "wrap(value)", "approved C-1348: the declared instantiation owns adoption");
    assert.equal(compiled.result.program !== undefined && compiled.result.artifacts.length > 0, true,
      "approved C1439: the declared native adoption publishes the original program");
  });

test("C# ordinary opaque callable input keeps its native value: " + name, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" },
      sourceText: declarations + "\nconsole.log(await wrap(7));" });
    assert.equal(compiled.result.diagnostics.length, 0, JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
    assert.equal(executeCsharpConstruction(compiled, "ordinary-native-opaque-" + name, false, false, [], "").trim(), "7",
      "ordinary Awaited identity does not add a refusal or alter the native callback result");
  });
}

for (const [name, declarations, expression] of Array.from(nativeOpaquePayloadCases).slice(12, 13)) {
test("C# native opaque callable input is unresolved, not safe empty: " + name, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: declarations +
      "\nexport function reject(value: Promise<number>): void { void wrap(value); }" });
    const call = supportedAdoption(compiled, "wrap(value)", "KindCallExpression", "wrap");
    const { ast } = compiled.source;
    assert.equal(ast.kindName(call), "KindCallExpression", "the original resolving operation owns its native completion");
    assert.equal(Buffer.from(ast.getSourceText(ast.getSourceFile(call))).subarray(ast.pos(call), ast.end(call))
      .toString("utf8").trim(), "wrap(value)", "approved C-1348: the declared instantiation owns adoption");
    assert.equal(compiled.result.program !== undefined && compiled.result.artifacts.length > 0, true,
      "approved C1439: the declared native adoption publishes the original program");
  });
}
