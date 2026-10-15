import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { nativeUnaryLocationsSource } from "../../../../tsonic/test/fixtures/native-unary-locations.mjs";

for (const surface of ["native", "js"]) {
  test(`${surface} native updates consume locations while receivers keep narrowed value reads`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nativeUnaryLocationsSource });
    assertCsharpCompilationSucceeded(compiled);
    const { program } = compiled.result;
    const { ast } = program.source;
    let updates = 0;
    let parentheses = 0;
    let narrowedReceivers = 0;
    const visit = node => {
      if (ast.is.IsPrefixUnaryExpression(node) || ast.is.IsPostfixUnaryExpression(node)) {
        const selected = program.records.unaryOperation.get(node)?.target;
        assert.equal(selected?.kind === "resolved", true, "the real native unary selection exists");
        if (selected.sourceOperator === "++" || selected.sourceOperator === "--") {
          updates += 1;
          let location = selected.operand;
          while (ast.is.IsParenthesizedExpression(location)) {
            parentheses += 1;
            location = ast.as.AsParenthesizedExpression(location).Expression;
          }
          assert.equal(program.records.flowReadProjection.get(location) === undefined, true,
            "a native write location is not a narrowed value read");
          if (ast.is.IsPropertyAccessExpression(location)) {
            const receiver = ast.as.AsPropertyAccessExpression(location).Expression;
            if (program.records.flowReadProjection.get(receiver)?.kind === "conversion") narrowedReceivers += 1;
          }
        }
      }
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    for (const sourceFile of program.sourceFiles) {
      if (String(ast.getPath(sourceFile)).endsWith("/index.ts")) visit(sourceFile);
    }
    assert.equal(updates, 10, "all real local, capture, field and indexed update operands are inspected");
    assert.equal(parentheses, 2, "both parenthesized update locations retain their exact inner identity");
    assert.equal(narrowedReceivers > 0, true, "a written member's narrowed receiver still has a read projection");
    const generated = compiled.artifacts.get("src/Index.cs");
    assert.equal(typeof generated, "string");
    assert.match(generated, /value\+\+/u);
    assert.match(generated, /\+\+value/u);
    assert.match(generated, /--\(value\)/u);
  });
}
