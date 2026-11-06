import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { createCsharpObjectShapePolicy } from "../../../dist/analysis/objects/shapes/api.js";
import { createCsharpTypeParameterEnvironment } from "../../../dist/analysis/source-evidence/types/resolution/type-parameter-environment.js";

function fixture() {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/entrypoint", files: {
    "/entrypoint/index.ts": "interface Options { value: number; } const value: Options = { value: 1 };",
  }, compilerOptions: { strict: true } }).checkSource();
  assert.equal(checked.diagnostics.length, 0, "the unchanged literal program is Source-valid");
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/entrypoint/index.ts");
  const nodes = [];
  const visit = node => { nodes.push(node); source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  visit(file);
  const literal = nodes.find(node => source.ast.is.IsObjectLiteralExpression(node));
  assert.equal(literal !== undefined, true, "the original authored allocation is retained");
  const actual = source.semantics.forFile(file).types.expressionType(literal);
  assert.equal(actual !== undefined, true, "the fixture has the actual checked Type, not a fabricated descriptor Type");
  const unexpected = () => assert.fail("a raw literal request must not select or reconstruct Source evidence");
  const policy = createCsharpObjectShapePolicy({ ast: source.ast,
    typeParameterConstraints: createCsharpTypeParameterEnvironment(unexpected),
    semantics: unexpected, semanticsFor: unexpected,
  });
  return { policy, actual, literal, file };
}

test("the orphan raw-Type shape endpoint is absent rather than a compatibility overload", () => {
  const { policy } = fixture();
  assert.equal(typeof policy.resolveType, "undefined", "literal ownership is selected by the canonical occurrence entrypoints");
});

test("the retained checked structural endpoint refuses a literal before any Source retry", () => {
  const { policy, actual, literal, file } = fixture();
  assert.equal(policy.resolveTypeWithState(actual, file, literal, { depth: 0 }) === undefined, true,
    "the separate checked structural proof cannot act as a raw literal entrypoint");
});
