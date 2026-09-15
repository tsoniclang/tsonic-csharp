import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import {
  csharpTaskTargetType,
  isCsharpNeverTargetType,
  isCsharpVoidTargetType,
} from "../../../target-model/types/index.js";
import type { TargetTypeRef } from "../../../target-model/types/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type {
  CsharpExpression,
} from "../../target-ast/roslyn/index.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import { planCsharpSourceUndefinedValue } from "./undefined-values.js";

export function planVoidExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  expectedTargetType?: TargetTypeRef,
): CsharpExpression | undefined {
  if (!input.program.source.ast.is.IsVoidExpression(node)) {
    return undefined;
  }
  const operand = input.program.source.ast.as.AsVoidExpression(node)?.Expression;
  const jsValueOperation = input.program.operations.jsVoid(node);
  if (jsValueOperation === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# planning received a void expression without a sealed operation classification.",
    ));
    return undefined;
  }
  if (jsValueOperation.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, jsValueOperation.reason));
    return undefined;
  }
  const operandType = operand === undefined ? undefined : input.types.classifications.resolveNode(operand, sourceFile);
  const target = expectedTargetType ?? input.types.classifications.resolveNode(node, sourceFile);
  const resultType = target === undefined ? undefined : csharpTypeFromTargetTypeRef(target);
  if (operand === undefined || operandType === undefined || target === undefined || resultType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "C# void translation requires exact sealed operand and result carriers.",
    ));
    return undefined;
  }
  const result = planCsharpSourceUndefinedValue(node, target, sourceFile, input, diagnostics);
  if (result.kind !== "resolved") {
    diagnostics.push(unsupportedNodeDiagnostic(node, "The selected C# void result cannot represent undefined."));
    return undefined;
  }
  const expression = planExpression(operand, sourceFile, input, diagnostics);
  if (expression === undefined) return undefined;
  if (expression.kind === "LiteralExpression" || expression.kind === "NumericLiteralExpression" ||
    expression.kind === "IntegerLiteralExpression" || expression.kind === "CharacterLiteralExpression") {
    return result.expression;
  }
  if (!isCsharpVoidTargetType(operandType) && !isCsharpNeverTargetType(operandType)) {
    return {
      kind: "SimpleMemberAccessExpression",
      receiver: { kind: "TupleExpression", elements: [expression,
        { kind: "CastExpression", type: resultType, expression: result.expression }] },
      name: "Item2",
    };
  }
  let statement: CsharpExpression = expression;
  while (statement.kind === "ParenthesizedExpression") statement = statement.expression;
  const asynchronous = statement.kind === "AwaitExpression";
  const returnType = asynchronous ? csharpTypeFromTargetTypeRef(csharpTaskTargetType(target)) : resultType;
  if (returnType === undefined) return undefined;
  const invocation: CsharpExpression = {
    kind: "InvocationExpression",
    callee: { kind: "ParenthesizedExpression", expression: { kind: "CastExpression",
      type: { kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "Func",
        typeArguments: [returnType] },
      expression: { kind: "LambdaExpression", async: asynchronous, parameters: [],
        body: { kind: "Block", statements: [
          { kind: "ExpressionStatement", expression: statement },
          { kind: "ReturnStatement", expression: result.expression },
        ] } } } },
    arguments: [],
  };
  return asynchronous ? { kind: "AwaitExpression", expression: invocation } : invocation;
}
