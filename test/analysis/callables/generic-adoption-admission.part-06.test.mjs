import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { code, identity, nativeEntryCases, nativeEntryInverses, nativeOpaquePayloadCases, nativeConstructorCases, nativeConstructorInverses, sourcePosition, sourceSpan, cases, rejected } from "./generic-adoption-admission.fixtures.mjs";

function supportedOpaque(compiled) {
  assert.deepEqual(compiled.result.diagnostics, [], "approved C-1373: the declared opaque callback Promise result is supported");
  assert.equal(compiled.result.program !== undefined && compiled.result.artifacts.length > 0, true,
    "the same original supported program publishes native output");
  const { ast } = compiled.source;
  const calls = [];
  const visit = node => {
    if (ast.is.IsCallExpression(node)) {
      const file = ast.getSourceFile(node);
      const text = Buffer.from(ast.getSourceText(file)).subarray(ast.pos(node), ast.end(node)).toString("utf8").trim();
      if (text === "wrap(value)") calls.push(node);
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  compiled.source.sourceFiles.filter(file => file !== undefined && !ast.isDeclarationFile(file)).forEach(visit);
  assert.equal(calls.length, 1, "the same original checked instantiation is unique");
  const call = calls[0];
  const file = ast.getSourceFile(call);
  assert.equal(file !== undefined && compiled.source.sourceFiles.includes(file), true,
    "the exact checked source owns the admitted node");
  assert.equal(ast.kindName(call), "KindCallExpression", "the original call is not replaced with a declaration or copied node");
  const selected = compiled.result.program.records.selectedCall.get(call)?.source;
  assert.equal(selected?.sourceSelectedSignatureKind, "resolved", "the original source call retains its completed selected native signature");
  const semantics = compiled.result.program.source.semantics.forNode(call);
  const declaration = semantics.declarations.signatureDeclaration(selected.selectedSignature);
  assert.equal(declaration !== undefined && ast.text(ast.name(declaration)) === "wrap", true,
    "the same exact selected generic declaration remains the native owner");
  assert.equal(selected.sourceArgumentBindings.length > 0 && selected.sourceSelectedMethodTypeArguments?.length > 0, true,
    "the actual checked parameter, argument and generic correspondence is not erased");
  const bytes = Buffer.from(ast.getSourceText(file));
  const start = bytes.indexOf("wrap(value)");
  const leading = /^[\t\n\v\f\r ]*/u.exec(bytes.subarray(ast.pos(call), ast.end(call)).toString("utf8"))[0];
  assert.equal(ast.pos(call) + Buffer.byteLength(leading) === start && ast.end(call) === start + Buffer.byteLength("wrap(value)"), true,
    "the original admitted instantiation retains its exact checked source span");
}

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
    supportedOpaque(compiled);
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
    supportedOpaque(compiled);
  });
}
