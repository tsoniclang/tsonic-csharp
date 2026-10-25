import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";

const header = `import type { int32 } from "@tsonic/core/types.js";
import { Span } from "@tsonic/dotnet/System.js";
function consume(view: Span<int32>, extra: int32): int32 { return view.Length + extra; }`;

test("an external source generic call is refused by its callee owner, not invented native metadata", () => {
  const compiled = compileCsharpSource({
    sourceText: `import { foreign } from "./foreign.js";
export function read(): number { return foreign<number>(1); }`,
    files: { "/project/foreign.d.ts": "export declare function foreign<Value>(value: Value): Value;" },
  });
  assert.equal(compiled.sourceDiagnosticsText, "", "the external generic signature is actual checked source");
  assert.equal(compiled.result.diagnostics.some(issue => issue.message.includes("external to the project")), true,
    "a declaration-only callee needs its actual native target relation");
  assert.equal(compiled.result.diagnostics.some(issue => issue.code === "CSHARP_REFLIKE_METADATA_NOT_PROVEN"), false,
    "a non-native source artifact has no fabricated anti-constraint contract");
  assert.equal(compiled.result.program === undefined, true, "external source calls are never admitted as native methods");
  assert.equal(compiled.result.artifacts.length, 0, "the unsupported source call emits no artifacts");
});

test("missing owned binding evidence refuses instead of silently skipping liveness", async () => {
  const { analyzeCsharpRefLikeLiveness } = await import("../../../dist/analysis/storage/ref-like-liveness.js");
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: {
    "/src/index.ts": "function run() { function nested() { const retained = 1; return retained; } return 1; }",
  }, compilerOptions: { strict: true, target: "esnext", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0, "the liveness boundary uses actual checked nodes");
  const source = createTargetSourceProgram(checked);
  const nodes = [];
  const collect = node => { nodes.push(node); source.ast.forEachChild(node, child => { if (child !== undefined) collect(child); }); };
  collect(checked.getSourceFile("/src/index.ts"));
  const declaration = nodes.find(node => source.ast.is.IsFunctionDeclaration(node) && source.ast.text(source.ast.name(node)) === "run");
  const binding = nodes.find(node => source.ast.is.IsVariableDeclaration(node) && source.ast.text(source.ast.name(node)) === "retained");
  assert.equal(declaration !== undefined && binding !== undefined, true, "both exact source owners exist");
  const issues = [];
  analyzeCsharpRefLikeLiveness(source, declaration, new Set([binding]), (node, code) => issues.push({ node, code }));
  assert.equal(issues.length, 1, "one missing owner proof is retained");
  assert.equal(issues[0].node === binding, true, "the diagnostic names the unproven binding");
  assert.equal(issues[0].code, "CSHARP_REFLIKE_LIVENESS_NOT_PROVEN", "missing graph evidence never grants permission");
});

test("a deeply nested completed native lifetime is admitted before a later await", { timeout: 240_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `${header}
export async function fail(values: int32[], pending: Promise<int32>): Promise<int32> {
  let size: int32 = 0;
  ${"{".repeat(130)} const view = new Span<int32>(values); size = view.Length; ${"}".repeat(130)}
  return size + await pending;
}` });
  assert.equal(compiled.sourceDiagnosticsText, "", "the deeply nested binding remains checked source");
  assert.equal(compiled.result.diagnostics.length, 0,
    JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
  assert.equal(compiled.result.program !== undefined, true, "the completed flow graph, not an obsolete lexical-depth cap, proves the lifetime");
  executeCsharpConstruction(compiled, "deep-native-ref-like-before-await", true, false, [],
    "if (await Tsonic.Generated.Index.fail(new int[] { 7, 9 }, System.Threading.Tasks.Task.FromResult(3)) != 5) throw new System.Exception(\"deep completed native lifetime\");");
});

test("a deeply nested native value still cannot remain live across await", () => {
  const compiled = compileCsharpSource({ sourceText: `${header}
export async function fail(values: int32[], pending: Promise<int32>): Promise<int32> {
  ${"{".repeat(130)} const view = new Span<int32>(values);
  const extra = await pending; return view.Length + extra; ${"}".repeat(130)}
}` });
  assert.equal(compiled.sourceDiagnosticsText, "", "the deeply nested live value is checked source");
  assert.equal(compiled.result.diagnostics.some(issue => issue.code === "CSHARP_REFLIKE_ACROSS_SUSPENSION"), true,
    JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
  assert.equal(compiled.result.program === undefined, true, "actual native suspension safety remains mandatory at every depth");
  assert.equal(compiled.result.artifacts.length, 0, "the unsafe native program is never emitted");
});

for (const [name, expression, local] of [
  ["local argument", "consume(view, await pending)", "const view = new Span<int32>(values);"],
  ["new temporary argument", "consume(new Span<int32>(values), await pending)", ""],
  ["sliced temporary argument", "consume(view.Slice(0), await pending)", "const view = new Span<int32>(values);"],
  ["receiver", "view.Slice(await pending).Length", "const view = new Span<int32>(values);"],
  ["conditional argument", "consume(new Span<int32>(values), values.Length === 0 ? 0 : await pending)", ""],
]) {
  test(`native full-expression liveness refuses ${name} across await`, () => {
    const compiled = compileCsharpSource({ sourceText: `${header}
export async function fail(values: int32[], pending: Promise<int32>): Promise<int32> {
  ${local} return ${expression};
}` });
    assert.equal(compiled.sourceDiagnosticsText, "", `${name}: checked source`);
    const codes = compiled.result.diagnostics.map(issue => issue.code);
    assert.equal(codes.includes("CSHARP_REFLIKE_ACROSS_SUSPENSION"), true, `${name}: ${JSON.stringify(codes)}`);
    assert.equal(compiled.result.program === undefined, true, `${name}: no published invalid native program`);
    assert.equal(compiled.result.artifacts.length, 0, `${name}: no emitted invalid native code`);
  });
}

for (const [name, body] of [
  ["same-scope pre-await local", `const view = new Span<int32>(values); const length = consume(view, 0); return length + await pending;`],
  ["consumed scalar before later await", `const view = new Span<int32>(values); return view.Length + await pending;`],
  ["ref-like created after suspension", `const extra = await pending; return consume(new Span<int32>(values), extra);`],
  ["separate conditional arms", `const view = new Span<int32>(values); return values.Length === 2 ? consume(view, 3) : await pending;`],
]) {
  test(`native expression lifetime retains ${name}`, { timeout: 240_000 }, () => {
    const compiled = compileCsharpSource({ sourceText: `${header}
export async function run(values: int32[], pending: Promise<int32>): Promise<int32> { ${body} }` });
    assert.equal(compiled.sourceDiagnosticsText, "", `${name}: checked source`);
    assert.equal(compiled.result.diagnostics.length, 0, JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
    executeCsharpConstruction(compiled, `native-ref-like-liveness-${name.replaceAll(" ", "-")}`, true, false, [],
      "if (await Tsonic.Generated.Index.run(new int[] { 7, 9 }, System.Threading.Tasks.Task.FromResult(3)) != 5) throw new System.Exception(\"native full-expression lifetime\");");
  });
}
