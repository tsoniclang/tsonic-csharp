import assert from "node:assert/strict";
import { createTargetSourceProgram } from "@tsonic/target-api/source";

export function assertNativeLoopRefusals(compiled, expected) {
  assert.equal(compiled.sourceDiagnosticsText, "", "the original program is checked source");
  assert.deepEqual(compiled.result.diagnostics.map(({ code, message }) => ({ code, message })),
    expected.map(({ message }) => ({ code: "CSHARP_UNSUPPORTED_AST", message })));
  const source = createTargetSourceProgram(compiled.source);
  const nodes = new Set();
  const visit = node => {
    nodes.add(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.navigation.sourceFiles) visit(file);
  for (const [index, diagnostic] of compiled.result.diagnostics.entries()) {
    const node = diagnostic.sourceNode;
    assert.equal(node !== undefined && nodes.has(node), true, `refusal ${index}: identical checked source node`);
    const range = source.ast.authoredRange(node);
    assert.equal(range.kind, "authored", `refusal ${index}: original authored location`);
    const text = source.ast.getSourceText(source.ast.getSourceFile(node));
    let offset = -1;
    for (let occurrence = 0; occurrence <= expected[index].occurrence; occurrence++)
      offset = text.indexOf(expected[index].text, offset + 1);
    assert.equal(offset >= 0 && range.start === offset && range.end === offset + expected[index].text.length,
      true, `refusal ${index}: exact write occurrence`);
  }
  assert.equal(compiled.artifacts.size, 0, "refused loops publish no artifacts");
}
