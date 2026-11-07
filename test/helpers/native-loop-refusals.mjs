import { csharpTestSourceProgram } from "./target-source-program.mjs";
import assert from "node:assert/strict";

export function assertNativeLoopRefusals(compiled, expected) {
  assert.equal(compiled.sourceDiagnosticsText, "", "the original program is checked source");
  assert.deepEqual(compiled.result.diagnostics.map(({ code, message }) => ({ code, message })),
    expected.map(({ code, message }) => {
      // Each refusal names its own .NET reason code (nextgen C-2542, R5): CSHARP_UNSUPPORTED_AST is split.
      assert.equal(typeof code === "string" && code.startsWith("CSHARP_") && code !== "CSHARP_UNSUPPORTED_AST", true,
        "an expected native loop refusal names its specific CSHARP_ code");
      return { code, message };
    }));
  const source = csharpTestSourceProgram(compiled.source);
  const nodes = new Set();
  const visit = node => {
    nodes.add(node);
    source.syntax.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.sourceFiles) visit(file);
  for (const [index, diagnostic] of compiled.result.diagnostics.entries()) {
    const node = diagnostic.sourceNode;
    assert.equal(node !== undefined && nodes.has(node), true, `refusal ${index}: identical checked source node`);
    const range = source.syntax.authoredRange(node);
    assert.equal(range.kind, "authored", `refusal ${index}: original authored location`);
    const text = source.syntax.getSourceText(source.syntax.getSourceFile(node));
    let offset = -1;
    for (let occurrence = 0; occurrence <= expected[index].occurrence; occurrence++)
      offset = text.indexOf(expected[index].text, offset + 1);
    assert.equal(offset >= 0 && range.start === offset && range.end === offset + expected[index].text.length,
      true, `refusal ${index}: exact write occurrence`);
  }
  assert.equal(compiled.artifacts.size, 0, "refused loops publish no artifacts");
}
