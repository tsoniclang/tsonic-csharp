import { csharpSourceValueResult } from "../../../dist/analysis/source-evidence/types/resolution/call-results.js";
import assert from "node:assert/strict";
import test from "node:test";
import { csharpSourceHasNumericConstraint } from "../../../dist/analysis/source-evidence/types/resolution/numeric-constraint-evidence.js";
import { selectCsharpGenericNumericOperation } from "../../../dist/analysis/operations/numeric/generic.js";
import { csharpBinarySelectionsEqual } from "../../helpers/binary-selections.mjs";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";

test("generic numeric identity comes only from the exact published operand and represented carrier", () => {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: {
    "/src/index.ts": "function numeric<Value extends number>(input: Value) { const local: Value = input; return local; }",
  }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0);
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  const nodes = [];
  const visit = node => { nodes.push(node); source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  visit(file);
  const declaration = nodes.find(node => source.ast.is.IsTypeParameterDeclaration(node));
  const expression = nodes.find(node => source.ast.is.IsIdentifier(node) && source.ast.is.IsReturnStatement(source.ast.parent(node)));
  assert.equal(declaration !== undefined && expression !== undefined, true, "actual checked binder and operand");
  const actual = source.effectiveTypes.get(expression);
  assert.equal(actual !== undefined && actual.kind !== "refused" && actual.provenance.occurrence === expression &&
    actual.type.kind === "declared" && actual.type.declaration === declaration, true,
  "the Host records the exact Source type-parameter declaration");
  const constraint = source.ast.as.AsTypeParameterDeclaration(declaration).Constraint;
  const carrier = { kind: "type-parameter", identity: "numeric:Value", name: "Value" };
  const scalar = { kind: "source-primitive", name: "float64" };
  const cases = [
    { name: "resolved", publication: actual, result: true },
    { name: "default", publication: { ...actual, kind: "default" }, result: true },
    { name: "missing", publication: undefined, result: false },
    { name: "refused", publication: { kind: "refused", source: "tsonic", code: "TSONIC_LOCAL_TYPE_SIGNATURE",
      site: expression, reason: "The Source operand has no chosen signature type." }, result: false },
    { name: "non-binder", publication: { ...actual, type: { kind: "primitive", primitive: "int32" } }, result: false },
    { name: "non-parameter declaration", publication: { ...actual, type: { ...actual.type, declaration: expression } }, result: false },
    { name: "unrepresented", publication: actual, unavailable: true, result: false },
    { name: "different carrier", publication: actual, different: true, result: false },
    { name: "no bound", publication: actual, noBound: true, result: false },
  ];
  for (const row of cases) {
    const host = { ast: row.noBound ? { ...source.ast, as: { ...source.ast.as,
      AsTypeParameterDeclaration: () => ({ Constraint: undefined }) } } : source.ast,
    effectiveTypes: { get(node) { assert.equal(node === expression, true, row.name); return row.publication; } },
    types: { resolveNode(node) {
      if (node === expression) return row.unavailable ? undefined : { kind: "resolved", sourceResult:
        csharpSourceValueResult(row.different ? { ...carrier, identity: "foreign" } : carrier) };
      assert.equal(node === constraint, true, row.name);
      return { kind: "resolved", sourceResult: csharpSourceValueResult(scalar) };
    } }, semantics: () => assert.fail("numeric operand identity never queries a checker value type"),
    navigation: { referenceFor: () => assert.fail("a declared alias cannot replace the actual operand publication") } };
    assert.equal(csharpSourceHasNumericConstraint(expression, carrier, file, host), row.result, row.name);
  }
  assert.throws(() => csharpSourceHasNumericConstraint(expression, carrier, file, { ast: source.ast,
    effectiveTypes: { get: () => ({ ...actual, provenance: { ...actual.provenance, occurrence: declaration } }) } }),
  error => error.diagnostic?.code === "TSONIC_INTERNAL_ANALYSIS_INVARIANT" && error.diagnostic.sourceNode === expression,
  "a foreign publication is rejected before any carrier or bound query");
  assert.equal(csharpSourceHasNumericConstraint(expression, scalar, file, {
    effectiveTypes: { get: () => assert.fail("ordinary scalars never request generic numeric identity") },
  }), false);
});

function scenario() {
  const file = {};
  const constraint = { kind: "number" };
  const declaration = { kind: "type-parameter", constraint };
  const expression = { kind: "value" };
  const carrier = { kind: "type-parameter", identity: "numeric:Value", name: "Value" };
  const scalar = { kind: "source-primitive", name: "float64" };
  const input = {
    // A literal operand is its own one-token source file, so the shared literal reader sees its authored token text.
    ast: { getSourceFile: node => node.kind === "literal" ? node : file, getSourceText: source => source.text,
      kindName: node => node.kind === "literal" ? "KindNumericLiteral" : node.kind, text: node => node.text,
      authoredRange: node => node.kind === "literal" ? { kind: "authored", start: 0, end: node.text.length } : { kind: "synthetic" },
      is: { IsTypeParameterDeclaration: node => node === declaration, IsUnionTypeNode: () => false,
        IsParenthesizedTypeNode: () => false, IsIntersectionTypeNode: () => false,
        IsParenthesizedExpression: () => false, IsPrefixUnaryExpression: () => false },
      as: { AsTypeParameterDeclaration: node => ({ Constraint: node.constraint }) } },
    effectiveTypes: { get(node) {
      assert.equal(node === expression, true, "numeric evidence uses the exact Host operand publication");
      return { kind: "resolved", type: { kind: "declared", declaration, typeArguments: [], indexes: [] },
        provenance: { group: expression, occurrence: expression, sourceFile: file } };
    } },
    semantics: () => assert.fail("numeric evidence must not read raw checker value types"),
    types: { resolveSelectedValue: () => assert.fail("numeric evidence must not convert a raw checker type"),
      resolveNode: node => node === expression ? { kind: "resolved", sourceResult: csharpSourceValueResult(carrier) }
        : node === constraint ? { kind: "resolved", sourceResult: csharpSourceValueResult(scalar) } : undefined },
  };
  return { input, file, declaration, expression, carrier, scalar };
}

test("native numeric evidence requires the exact declaration, carrier and emitted bound", () => {
  const { input, file, declaration, expression, carrier } = scenario();
  assert.equal(csharpSourceHasNumericConstraint(expression, carrier, file, input), true);
  assert.equal(csharpSourceHasNumericConstraint(expression, { ...carrier, identity: "other" }, file, input), false);
  assert.equal(csharpSourceHasNumericConstraint(expression, carrier, file,
    { ...input, types: { ...input.types, resolveNode: () => undefined } }), false);
  assert.equal(csharpSourceHasNumericConstraint(expression, carrier, file,
    { ...input, ast: { ...input.ast, getSourceFile: () => undefined } }), false);
  declaration.constraint = undefined;
  assert.equal(csharpSourceHasNumericConstraint(expression, carrier, file, input), false);
});

test("native generic comparisons admit same-carrier and zero operands in both directions", () => {
  const { input, expression, carrier, scalar } = scenario();
  const zero = { kind: "literal", text: "0" };
  for (const operator of ["<", "<=", ">", ">=", "===", "!=="]) {
    assert.equal(selectCsharpGenericNumericOperation(input, operator, expression, zero, carrier, scalar)?.zeroOperand, "right");
    assert.equal(selectCsharpGenericNumericOperation(input, operator, zero, expression, scalar, carrier)?.zeroOperand, "left");
    assert.equal(selectCsharpGenericNumericOperation(input, operator, expression, expression, carrier, carrier)?.kind, "generic-numeric");
  }
  for (const operand of [{ kind: "literal", text: "1" }, { kind: "value", text: "0" }]) {
    assert.equal(selectCsharpGenericNumericOperation(input, "<", expression, operand, carrier, scalar), undefined);
  }
  assert.equal(selectCsharpGenericNumericOperation(input, "+", expression, zero, carrier, scalar), undefined);
  assert.equal(selectCsharpGenericNumericOperation(input, "<", expression, expression,
    carrier, { ...carrier, identity: "other" }), undefined);
});

test("sealed generic operation equality retains zero position and native parameter identity", () => {
  const carrier = { kind: "type-parameter", identity: "numeric:Value", name: "Value" };
  const expression = {};
  const operation = { kind: "generic-numeric", operator: "<", carrier, zeroOperand: "right" };
  const selection = { kind: "resolved", sourceOperator: "<", left: expression, right: expression,
    targetOperation: operation, leftType: carrier, rightType: carrier,
    leftInputType: carrier, rightInputType: carrier, resultType: { kind: "source-primitive", name: "bool" } };
  assert.equal(csharpBinarySelectionsEqual(selection, { ...selection }), true);
  for (const changed of [{ ...operation, zeroOperand: "left" },
    { ...operation, carrier: { ...carrier, identity: "other" } }]) {
    assert.equal(csharpBinarySelectionsEqual(selection, { ...selection, targetOperation: changed }), false);
  }
});
