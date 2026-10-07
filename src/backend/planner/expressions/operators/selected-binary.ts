import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpResolvedBinaryOperation,
} from "../../../../analysis/operations/index.js";
import type {
  CsharpPlanningContext,
} from "../../context.js";
import type {
  CsharpExpression,
} from "../../../target-ast/roslyn/index.js";
import {
  csharpAssignmentOperatorTokenFromText,
  csharpBinaryOperatorTokenFromText,
} from "../csharp-operator-tokens.js";
import {
  unsupportedNodeDiagnostic,
} from "../../diagnostics.js";
import type {
  ExpectedExpressionPlanner,
  ExpressionPlanner,
} from "../expression-planner-types.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../types/target-types.js";
import {
  planBinaryOperand,
} from "./operands.js";
import {
  callStatic,
  literalNumber,
} from "../csharp-expression-builders.js";
import { isCsharpAbsenceTargetType } from "../../../../target-model/types/runtime-carriers.js";
import { planCsharpBigIntCall } from "./bigint-call.js";
import { planCsharpClosedValueCoalescing } from "./closed-value-coalescing.js";
import type { DestructuringPlannerState } from "../../bindings/binding-state.js";
import { allocateExpressionTemp } from "../../bindings/binding-state.js";
import { runtimeUnionArmProjection, runtimeUnionArmTest } from "../union-access.js";
import { planCsharpUnionEquality } from "../union-equality.js";
import { csharpPlannedValue, mapCsharpPlannedValue, type CsharpPlannedValue } from "../planned-values.js";
import { buildCsharpPlannedValue, planCsharpCoalescingValue, planCsharpValueBranch } from "../planned-value-composition.js";
import { csharpSourcePrimitiveTargetType } from "../../../../target-model/types/scalar-types.js";
import { captureCsharpPlannedLocation } from "../planned-locations.js";
import { captureCsharpPlannedValue } from "../planned-value-composition.js";
import { planCsharpPlannedDiscard } from "../../statements/statement-output.js";
import { planCsharpConditionalValue } from "./conditional-values.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";

export function planSelectedCsharpBinaryOperation(
  node: Node,
  selection: CsharpResolvedBinaryOperation,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
  state?: DestructuringPlannerState,
): CsharpPlannedValue | undefined {
  const operation = selection.targetOperation;
  if (operation.kind === "conditional-value") return planCsharpConditionalValue(
    node, selection, sourceFile, input, diagnostics, planExpression, planExpressionWithExpectedType, state);
  if (operation.kind === "sequence") {
    const left = planExpression(selection.left, sourceFile, input, diagnostics, state);
    if (left === undefined || left.completion.kind === "never") return left;
    const type = csharpTypeFromTargetTypeRef(selection.resultType, input.scope.typeParameterNames);
    const right = type === undefined || operation.resultUse === "discarded"
      ? planExpression(selection.right, sourceFile, input, diagnostics, state)
      : planExpressionWithExpectedType(selection.right, sourceFile, input, diagnostics,
        type, undefined, selection.resultType, state);
    return right === undefined ? undefined : {
      prelude: [...planCsharpPlannedDiscard(left), ...right.prelude], completion: right.completion,
    };
  }
  if (operation.kind === "closed-value-coalesce") {
    return planCsharpClosedValueCoalescing(node, selection, sourceFile, input, diagnostics,
      planExpression, planExpressionWithExpectedType, state);
  }
  if (operation.kind === "union-equality") {
    return planCsharpUnionEquality(node, selection, sourceFile, input, diagnostics, planExpression, state);
  }
  if (operation.kind === "bigint-call") {
    return planCsharpBigIntCall(node, selection, sourceFile, input, diagnostics, planExpression, state);
  }
  if (operation.kind === "union-coalesce") {
    const resultType = csharpTypeFromTargetTypeRef(selection.resultType, input.scope.typeParameterNames);
    if (state === undefined || resultType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "Union coalescing requires its sealed result type and hygienic evaluation scope."));
      return undefined;
    }
    const left = planExpression(selection.left, sourceFile, input, diagnostics, state);
    const right = planExpressionWithExpectedType(selection.right, sourceFile, input, diagnostics,
      resultType, undefined, selection.resultType, state);
    if (left === undefined || right === undefined) return undefined;
    const name = allocateExpressionTemp(state);
    const reference: CsharpExpression = { kind: "IdentifierName", name };
    if (left.completion.kind === "never") return left;
    if (left.completion.kind !== "value") return undefined;
    const condition: CsharpExpression = {
      kind: "BinaryExpression", operatorToken: { kind: "AmpersandAmpersandToken" },
      left: { kind: "IsPatternExpression", expression: left.completion.expression, type: { kind: "IdentifierName", name: "var" }, designation: name },
      right: runtimeUnionArmTest(reference, operation.valueArmIndex, selection.leftType),
    };
    return planCsharpValueBranch(node, sourceFile, input, diagnostics,
      csharpPlannedValue(csharpSourcePrimitiveTargetType("bool"), condition, left.prelude),
      csharpPlannedValue(selection.resultType, operation.retainCarrier ? reference
        : runtimeUnionArmProjection(reference, operation.valueArmIndex, selection.leftType)),
      right, selection.resultType);
  }
  if (operation.kind === "array-index-presence") {
    const left = planExpression(selection.left, sourceFile, input, diagnostics);
    const right = planExpression(selection.right, sourceFile, input, diagnostics);
    return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [left, right], values => callStatic(
      { kind: "IdentifierName", requiredUsingNamespace: "Tsonic.CSharp.Js", name: "ArrayLike" },
      "HasIndex", values,
    ), selection.resultType);
  }
  if (operation.kind === "nullish-equality") {
    const operands = [
      { node: selection.left, type: selection.leftInputType },
      { node: selection.right, type: selection.rightInputType },
    ].map(({ node: operand, type }) => {
      const syntaxType = csharpTypeFromTargetTypeRef(type, input.scope.typeParameterNames);
      const expression = syntaxType === undefined ? undefined : planExpressionWithExpectedType(
        operand, sourceFile, input, diagnostics, syntaxType, undefined, type, state,
      );
      return expression;
    });
    const [left, right] = operands;
    if (left === undefined || right === undefined) return undefined;
    return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [left, right], values => ({
      kind: "SimpleMemberAccessExpression",
      receiver: { kind: "TupleExpression", elements: [...values,
        { kind: "LiteralExpression", value: operation.value }] },
      name: "Item3",
    }), selection.resultType);
  }
  if (operation.kind === "nullish-test") {
    const operandNode = operation.operand === "left"
      ? selection.left
      : selection.right;
    const operand = planExpression(
      operandNode,
      sourceFile,
      { ...input, storageExpression: operandNode },
      diagnostics,
    );
    if (operand === undefined) return undefined;
    const otherNode = operation.operand === "left" ? selection.right : selection.left;
    const other = planExpression(otherNode, sourceFile, input, diagnostics);
    if (other === undefined) return undefined;
    const ordered = operation.operand === "left" ? [operand, other] : [other, operand];
    return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, ordered, values => {
    const selectedOperand = values[operation.operand === "left" ? 0 : 1]!;
    const selectedOther = values[operation.operand === "left" ? 1 : 0]!;
    let tested = selectedOperand;
    const intrinsicUndefined = input.program.source.ast.is.IsIdentifier(otherNode) &&
      input.program.sourceNavigation.referenceFor(otherNode) === undefined &&
      isCsharpAbsenceTargetType(input.program.sourceEvidence.nodeTargetType(otherNode));
    if (selectedOther.kind !== "LiteralExpression" && !intrinsicUndefined) {
      const testedType = csharpTypeFromTargetTypeRef(operation.operand === "left"
        ? selection.leftType : selection.rightType, input.scope.typeParameterNames);
      const otherType = csharpTypeFromTargetTypeRef(operation.operand === "left"
        ? selection.rightType : selection.leftType, input.scope.typeParameterNames);
      if (testedType === undefined || otherType === undefined) return undefined;
      const testedValue: CsharpExpression = { kind: "CastExpression", type: testedType, expression: selectedOperand };
      const otherValue: CsharpExpression = { kind: "CastExpression", type: otherType, expression: selectedOther };
      tested = { kind: "SimpleMemberAccessExpression",
        receiver: { kind: "TupleExpression", elements: operation.operand === "left"
          ? [testedValue, otherValue] : [otherValue, testedValue] },
        name: operation.operand === "left" ? "Item1" : "Item2" };
    }
    const arms = operation.unionArmIndexes;
    if (arms !== undefined) {
      if (arms.length === 0) return { kind: "SimpleMemberAccessExpression", receiver: {
        kind: "TupleExpression", elements: [tested, { kind: "LiteralExpression", value: operation.negated }],
      }, name: "Item2" };
      let reference = tested;
      let temporary: string | undefined;
      if (arms.length > 1) {
        if (state === undefined) {
          diagnostics.push(unsupportedNodeDiagnostic(node, "A multi-arm nullish test requires a hygienic evaluation scope."));
          return undefined;
        }
        temporary = allocateExpressionTemp(state);
        reference = { kind: "IdentifierName", name: temporary };
      }
      const carrier = operation.operand === "left" ? selection.leftType : selection.rightType;
      let test = arms.map(arm => runtimeUnionArmTest(reference, arm, carrier)).reduce((left, right): CsharpExpression => ({
        kind: "BinaryExpression", left, operatorToken: { kind: "BarBarToken" }, right,
      }));
      if (operation.negated) test = {
        kind: "PrefixUnaryExpression", operatorToken: { kind: "ExclamationToken" }, operand: test,
      };
      return temporary === undefined ? test : {
        kind: "BinaryExpression", operatorToken: { kind: "AmpersandAmpersandToken" },
        left: { kind: "IsPatternExpression", expression: tested, type: { kind: "IdentifierName", name: "var" }, designation: temporary },
        right: test,
      };
    }
    return { kind: "NullPatternExpression", expression: tested, negated: operation.negated };
    }, selection.resultType);
  }
  if (operation.kind === "string-ordinal-relational") {
    const operatorToken = csharpBinaryOperatorTokenFromText(
      operation.operator,
    );
    const left = planExpression(
      selection.left,
      sourceFile,
      input,
      diagnostics,
    );
    const right = planExpression(
      selection.right,
      sourceFile,
      input,
      diagnostics,
    );
    if (operatorToken === undefined || left === undefined || right === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Selected C# string relational operator '${operation.operator}' could not be planned exactly.`,
      ));
      return undefined;
    }
    return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [left, right], values => ({
      kind: "BinaryExpression",
      left: callStatic(
        { kind: "PredefinedType", name: "string" },
        "CompareOrdinal",
        values,
      ),
      operatorToken,
      right: literalNumber(0),
    }), selection.resultType);
  }
  if (operation.kind === "reference-identity") {
    const left = planExpression(
      selection.left,
      sourceFile,
      input,
      diagnostics,
    );
    const right = planExpression(
      selection.right,
      sourceFile,
      input,
      diagnostics,
    );
    if (left === undefined || right === undefined) {
      return undefined;
    }
    return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [left, right], values => {
    const comparison: CsharpExpression = operation.distinctMethodValues === true ? {
      kind: "BinaryExpression",
      left: { kind: "TupleExpression", elements: values },
      operatorToken: { kind: "EqualsEqualsToken" },
      right: { kind: "TupleExpression", elements: [
        { kind: "LiteralExpression", value: null }, { kind: "LiteralExpression", value: null },
      ] },
    } : callStatic(
      { kind: "PredefinedType", name: "object" },
      "ReferenceEquals",
      values,
    );
    return operation.negated
      ? {
          kind: "PrefixUnaryExpression",
          operatorToken: { kind: "ExclamationToken" },
          operand: comparison,
        }
      : comparison;
    }, selection.resultType);
  }
  const targetOperator = operation.operator;
  const assignmentToken = csharpAssignmentOperatorTokenFromText(
    targetOperator,
  );
  if (assignmentToken !== undefined) {
    let storageExpression = selection.left;
    while (input.program.source.ast.is.IsParenthesizedExpression(storageExpression)) {
      const inner = input.program.source.ast.as.AsParenthesizedExpression(storageExpression)?.Expression;
      if (inner === undefined) return undefined;
      storageExpression = inner;
    }
    const left = planExpression(
      selection.left,
      sourceFile,
      { ...input, storageExpression },
      diagnostics,
    );
    const expectedRightType = csharpTypeFromTargetTypeRef(selection.rightInputType, input.scope.typeParameterNames);
    const right = expectedRightType !== undefined
      ? planExpressionWithExpectedType(
          selection.right,
          sourceFile,
          input,
          diagnostics,
          expectedRightType,
          undefined,
          selection.rightInputType,
        )
      : planExpression(
          selection.right,
          sourceFile,
          input,
          diagnostics,
        );
    if (left === undefined || right === undefined) return undefined;
    if (left.completion.kind === "never") return left;
    if (left.completion.kind !== "value") return undefined;
    const narrowedCoalescing = assignmentToken.kind === "QuestionQuestionEqualsToken" &&
      !targetTypeRefEquals(selection.resultType, left.completion.carrier);
    const direct = !narrowedCoalescing && right.prelude.length === 0 && right.completion.kind === "value";
    if (direct) return csharpPlannedValue(selection.resultType, { kind: "AssignmentExpression",
      left: left.completion.expression, operatorToken: assignmentToken, right: right.completion.expression }, left.prelude);
    const fact = input.program.storage.nativeLocation(storageExpression);
    if (fact?.kind !== "resolved" || !fact.writable) {
      diagnostics.push(unsupportedNodeDiagnostic(node, fact?.kind === "rejected" ? fact.reason
        : "A sequenced native assignment requires its sealed writable physical location."));
      return undefined;
    }
    const captured = captureCsharpPlannedLocation(node, sourceFile, input, diagnostics, left, fact,
      input.program.sourceNavigation.expressionEffects(selection.right).suspends);
    if (captured === undefined || captured.completion.kind !== "value") return captured;
    const location = captured.completion.expression;
    if (assignmentToken.kind === "QuestionQuestionEqualsToken") {
      let assigned = right;
      if (right.completion.kind === "value" && narrowedCoalescing) {
        const result = captureCsharpPlannedValue(node, input, diagnostics, selection.resultType);
        if (result === undefined) return undefined;
        const reference: CsharpExpression = { kind: "IdentifierName", name: result.name };
        assigned = csharpPlannedValue(selection.resultType, reference, [...right.prelude,
          { kind: "LocalDeclarationStatement", ...result, initializer: right.completion.expression },
          { kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", left: location,
            operatorToken: { kind: "EqualsToken" }, right: reference } },
        ]);
      } else if (right.completion.kind === "value") {
        const result = mapCsharpPlannedValue(right, selection.resultType, expression => ({
          kind: "AssignmentExpression", left: location,
          operatorToken: { kind: "EqualsToken" }, right: expression,
        }));
        if (result === undefined) return undefined;
        assigned = result;
      }
      return planCsharpCoalescingValue(
        node, sourceFile, input, diagnostics, captured, assigned, selection.resultType);
    }
    const prelude = [...captured.prelude];
    let target = location;
    if (assignmentToken.kind !== "EqualsToken") {
      const old = captureCsharpPlannedValue(node, input, diagnostics, selection.leftInputType);
      if (old === undefined) return undefined;
      prelude.push({ kind: "LocalDeclarationStatement", ...old, initializer: target });
      target = { kind: "IdentifierName", name: old.name };
    }
    prelude.push(...right.prelude);
    if (right.completion.kind === "never") return { prelude, completion: right.completion };
    if (right.completion.kind !== "value") return undefined;
    if (assignmentToken.kind === "EqualsToken") return csharpPlannedValue(selection.resultType, {
      kind: "AssignmentExpression", left: target, operatorToken: assignmentToken, right: right.completion.expression,
    }, prelude);
    const result = captureCsharpPlannedValue(node, input, diagnostics, selection.resultType);
    if (result === undefined) return undefined;
    const completed: CsharpExpression = { kind: "IdentifierName", name: result.name };
    return csharpPlannedValue(selection.resultType, completed, [...prelude,
      { kind: "LocalDeclarationStatement", ...result, initializer: { kind: "AssignmentExpression",
        left: target, operatorToken: assignmentToken, right: right.completion.expression } },
      { kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", left: location,
        operatorToken: { kind: "EqualsToken" }, right: completed } },
    ]);
  }
  const binaryToken = csharpBinaryOperatorTokenFromText(targetOperator);
  if (binaryToken === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Selected C# operator '${targetOperator}' has no target AST token.`,
    ));
    return undefined;
  }
  const left = planBinaryOperand(
    selection.left,
    binaryToken,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    planExpressionWithExpectedType,
    csharpTypeFromTargetTypeRef(selection.leftInputType, input.scope.typeParameterNames),
    selection.leftInputType,
  );
  const right = planBinaryOperand(
    selection.right,
    binaryToken,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    planExpressionWithExpectedType,
    csharpTypeFromTargetTypeRef(selection.rightInputType, input.scope.typeParameterNames),
    selection.rightInputType,
  );
  if (left === undefined || right === undefined) return undefined;
  if (binaryToken.kind === "QuestionQuestionToken") return planCsharpCoalescingValue(
    node, sourceFile, input, diagnostics, left, right, selection.resultType);
  const zeroType = operation.kind === "generic-numeric" && operation.zeroOperand !== undefined
    ? csharpTypeFromTargetTypeRef(operation.carrier, input.scope.typeParameterNames) : undefined;
  if (operation.kind === "generic-numeric" && operation.zeroOperand !== undefined && zeroType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Generic numeric zero requires its sealed native type parameter."));
    return undefined;
  }
  return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [left, right], values => {
  if (input.program.numericRepresentations.usesInt32Remainder(node)) {
    const integer = csharpTypeFromTargetTypeRef({ kind: "source-primitive", name: "int32" }, input.scope.typeParameterNames)!;
    const number = csharpTypeFromTargetTypeRef({ kind: "source-primitive", name: "float64" }, input.scope.typeParameterNames)!;
    return {
      kind: "CastExpression",
      type: number,
      expression: {
        kind: "ParenthesizedExpression",
        expression: {
          kind: "BinaryExpression",
          left: { kind: "CastExpression", type: integer, expression: { kind: "ParenthesizedExpression", expression: values[0]! } },
          operatorToken: binaryToken,
          right: { kind: "CastExpression", type: integer, expression: { kind: "ParenthesizedExpression", expression: values[1]! } },
        },
      },
    };
  }
  return {
        kind: "BinaryExpression",
        left: operation.kind === "generic-numeric" && operation.zeroOperand === "left" && zeroType !== undefined
          ? { kind: "SimpleMemberAccessExpression", receiver: zeroType, name: "Zero" } : values[0]!,
        operatorToken: binaryToken,
        right: operation.kind === "generic-numeric" && operation.zeroOperand === "right" && zeroType !== undefined
          ? { kind: "SimpleMemberAccessExpression", receiver: zeroType, name: "Zero" } : values[1]!,
      };
  }, selection.resultType);
}
