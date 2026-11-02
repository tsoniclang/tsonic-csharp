import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpBinaryEmission } from "../../../dist/analysis/operations/binary-emission.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

function assignmentFixture(storage, destination) {
  const left = {};
  const right = {};
  const assignment = {};
  const none = Object.freeze({ get: () => undefined });
  const selection = { kind: "resolved", sourceOperator: "=", targetOperation: { kind: "operator", operator: "=" },
    left, right, leftType: storage, leftInputType: storage, rightType: csharpSourcePrimitiveTargetType("int64"),
    rightInputType: destination, resultType: storage };
  const input = {
    source: { ast: { is: { IsBinaryExpression: node => node === assignment, IsParenthesizedExpression: () => false },
      as: { AsBinaryExpression: () => ({ Left: left, Right: right }) }, operatorKindName: () => "KindEqualsToken" },
    navigation: { expressionEffects: () => ({ suspends: false }) } },
    nodes: [assignment], admitted: () => true, optionalLocals: none,
    operations: { borrowedSequence: none, operatorForm: none, switchStatement: none,
      binaryOperation: { get: node => node === assignment ? { target: selection } : undefined } },
    demand: { entries: [], nativeUse: { expression: node => node === right ? { use: { kind: "converted", expression: right,
      carrier: csharpSourcePrimitiveTargetType("int64"), input: { kind: "value", type: csharpSourcePrimitiveTargetType("int64") },
      target: destination, completion: { kind: "value", type: destination } } } : undefined } },
    storage: { nativeLocation: { get: node => node === left
      ? { kind: "resolved", expression: left, storageType: storage, writable: true } : undefined } },
    constants: { nativeAbsence: none },
  };
  return { input, assignment, selection };
}

test("native assignment publication checks the completed conversion destination, not the raw operand", () => {
  const floating = csharpSourcePrimitiveTargetType("float64");
  const value = assignmentFixture(floating, floating);
  const result = analyzeCsharpBinaryEmission(value.input);
  assert.deepEqual(result.issues, []);
  assert.equal(result.records.nativeBinaryEmission.get(value.assignment, value.selection)?.location?.storageType === floating, true,
    "an admitted long-to-double conversion retains the exact double physical destination");
});

test("native assignment publication rejects a completed destination that differs from physical storage", () => {
  const value = assignmentFixture(csharpSourcePrimitiveTargetType("int64"), csharpSourcePrimitiveTargetType("float64"));
  assert.throws(() => analyzeCsharpBinaryEmission(value.input),
    /An admitted native assignment conversion must complete at its physical storage carrier\./u);
});

test("binary emission defers only the exact selected optional local operation to its physical owner", () => {
  const checked = checkCsharpSource({ sourceText: `
    export function replace<Value extends object>(fallback: Value): void {
      let owned: Value | undefined = undefined;
      let ordinary: Value | undefined = undefined;
      owned ??= fallback;
      ordinary ??= fallback;
    }
  ` });
  assert.equal(checked.sourceDiagnosticsText === "", true, "the original generic coalescing source is checked");
  const source = createTargetSourceProgram(checked.source);
  const nodes = [];
  let declaration;
  const visit = node => {
    if (source.ast.is.IsBinaryExpression(node)) nodes.push(node);
    if (source.ast.is.IsVariableDeclaration(node) && source.ast.text(source.ast.name(node)) === "owned") declaration = node;
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  source.sourceFiles.forEach(visit);
  assert.equal(nodes.length, 2, "two distinct original binary nodes reach admission");
  assert.equal(declaration !== undefined, true, "the selected local retains its original declaration identity");
  const [owned, ordinary] = nodes;
  const payload = Object.freeze({ kind: "source-primitive", name: "int32" });
  const placement = Object.freeze({ declaration, storage: payload, payload,
    payloadName: "payload", presenceName: "present" });
  const operation = Object.freeze({ kind: "coalesce", placement,
    right: source.ast.as.AsBinaryExpression(owned).Right, assignment: true });
  const none = Object.freeze({ get: () => undefined });
  const rejected = Object.freeze({ kind: "rejected", reason: "The ordinary generic operator remains unadmitted." });
  const result = analyzeCsharpBinaryEmission({ source, nodes,
    optionalLocals: { get: node => node === owned ? operation : undefined },
    admitted: () => true,
    operations: { borrowedSequence: none, operatorForm: none, switchStatement: none,
      binaryOperation: { get: node => {
        assert.equal(node === ordinary, true, "the selected local operation never requests a competing binary classification");
        return { target: rejected };
      } } },
    demand: { entries: [], nativeUse: { expression: () => undefined } },
    storage: { nativeLocation: none }, constants: { nativeAbsence: none },
  });
  assert.equal(result.issues.length, 1, "only the unselected ordinary operation is refused");
  assert.equal(result.issues[0].sourceNode === ordinary, true, "the rejection retains the exact unselected source node");
  assert.equal(result.issues[0].code, "CSHARP_UNSUPPORTED_AST", "ordinary native admission remains authoritative");
  assert.equal(result.issues[0].message, rejected.reason, "the original ordinary refusal is preserved");
  assert.equal(result.records.binaryEmission.get(owned) === undefined, true, "the local owner has no duplicate binary emission plan");
  assert.equal(result.records.binaryEmission.get(ordinary) === undefined, true, "a refusal publishes no binary plan");
});
