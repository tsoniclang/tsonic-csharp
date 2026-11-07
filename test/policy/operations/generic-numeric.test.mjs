import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpGenericNumericOperation } from "../../../dist/analysis/operations/numeric/generic.js";
import { csharpBinarySelectionsEqual } from "../../helpers/binary-selections.mjs";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { csharpTestSourceProgram } from "../../helpers/target-source-program.mjs";

// Generic numeric identity (nextgen C-2542): the operand's published value type is the binder declaration (Host
// values.type), it represents as that C# type parameter (types.value), and the binder's C# constraints (types.
// typeParameterConstraints, from the Host descriptors of its authored constraint) contain INumber<T>.
test("the Host publishes a generic operand as its exact type-parameter declaration", () => {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: {
    "/src/index.ts": "function numeric<Value extends number>(input: Value) { const local: Value = input; return local; }",
  }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0);
  const source = csharpTestSourceProgram(checked);
  const ast = source.syntax;
  const file = checked.getSourceFile("/src/index.ts");
  const nodes = [];
  const visit = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  visit(file);
  const declaration = nodes.find(node => ast.is.IsTypeParameterDeclaration(node));
  const expression = nodes.find(node => ast.is.IsIdentifier(node) && ast.is.IsReturnStatement(ast.parent(node)));
  const actual = source.facts.values.type(expression);
  assert.equal(actual.kind !== "refused" && actual.type.kind === "declared" && actual.type.declaration === declaration, true,
    "the Host records the exact Source type-parameter declaration");
});

function scenario() {
  const file = {};
  const declaration = { kind: "type-parameter" };
  const expression = { kind: "value" };
  const carrier = { kind: "type-parameter", identity: "numeric:Value", name: "Value" };
  const scalar = { kind: "source-primitive", name: "float64" };
  const numeric = { kind: "resolved", constraints: [{ kind: "type", type: { kind: "target-named",
    id: "System.Numerics.INumber`1", typeArguments: [carrier] } }] };
  const state = { publication: { kind: "resolved", type: { kind: "declared", declaration, typeArguments: [] } },
    represented: carrier, constraints: numeric };
  const input = {
    // A literal operand is its own one-token source file, so the shared literal reader sees its authored token text.
    ast: { getSourceFile: node => node.kind === "literal" ? node : file, getSourceText: source => source.text,
      kindName: node => node.kind === "literal" ? "KindNumericLiteral" : node.kind, text: node => node.text,
      authoredRange: node => node.kind === "literal" ? { kind: "authored", start: 0, end: node.text.length } : { kind: "synthetic" },
      is: { IsTypeParameterDeclaration: node => node === declaration,
        IsParenthesizedExpression: () => false, IsPrefixUnaryExpression: () => false } },
    facts: { values: { type(node) {
      assert.equal(node === expression, true, "numeric evidence uses the exact Host operand publication");
      return state.publication;
    } } },
    types: {
      value: node => node === expression ? state.represented : assert.fail("only the generic operand is represented"),
      typeParameterConstraints: (binder, parameter) => {
        assert.equal(binder === declaration && parameter === carrier, true, "constraints of the exact binder");
        return state.constraints;
      },
    },
  };
  return { input, state, file, declaration, expression, carrier, scalar };
}

test("native numeric evidence requires the exact binder publication, carrier and INumber bound", () => {
  const { input, state, expression, carrier, scalar } = scenario();
  const zero = { kind: "literal", text: "0" };
  assert.equal(selectCsharpGenericNumericOperation(input, "<", expression, zero, carrier, scalar)?.kind, "generic-numeric");
  for (const [name, change] of [
    ["refused publication", () => { state.publication = { kind: "refused", code: "TSONIC_LOCAL_TYPE_SIGNATURE", site: expression, reason: "" }; }],
    ["non-binder", () => { state.publication = { kind: "resolved", type: { kind: "primitive", primitive: "int32" } }; }],
    ["different carrier", () => { state.represented = { ...carrier, identity: "foreign" }; }],
    ["CSHARP_ refusal", () => { state.represented = { kind: "csharp-refused", code: "CSHARP_UNION_ARITY", message: "", site: expression }; }],
    ["no INumber bound", () => { state.constraints = { kind: "resolved", constraints: [] }; }],
  ]) {
    const fresh = scenario();
    change.call(undefined);
    Object.assign(fresh.state, state);
    assert.equal(selectCsharpGenericNumericOperation(fresh.input, "<", fresh.expression, zero, fresh.carrier, fresh.scalar), undefined, name);
    Object.assign(state, scenario().state);
  }
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
