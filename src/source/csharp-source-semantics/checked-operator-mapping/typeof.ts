import {
  acceptObservation,
  rejectObservation,
} from "@tsonic/tsts";
import type {
  CheckedOperationMappingResult,
  CheckedOperatorMappingRequest,
  ExtensionFactSubject,
  ExtensionObservation,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  csharpProviderDiagnostic,
} from "../diagnostics.js";
import {
  csharpTargetTypeofRuntimeOperation,
  recordCsharpTargetOperation,
  targetOperation,
} from "../operations.js";
import {
  asNodeSubject,
  getNodeField,
} from "../ast-utils.js";
import {
  getBinaryOperatorText,
} from "../operator-syntax.js";
import {
  getTypeofRuntimeKind,
} from "../typeof-operators.js";
import type {
  TargetTypeRefResolutionOptions,
} from "../target-member-selection.js";
import type {
  CsharpOperationsProviderHost,
} from "../operations-provider.js";

const noRuntimeCarrierQuery = { allowRuntimeCarrier: false } satisfies TargetTypeRefResolutionOptions;

export function mapCsharpTypeofOperator(
  request: CheckedOperatorMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedOperator">,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (request.operator !== "typeof") {
    return undefined;
  }
  const sourceFile = asNodeSubject(request.left) === undefined ? undefined : context.compiler?.ast.getSourceFile(asNodeSubject(request.left)!);
  const checkedOperandType = asNodeSubject(request.left) === undefined || context.compiler === undefined
    ? undefined
    : context.compiler.checker.getTypeAtLocation(asNodeSubject(request.left)!, { sourceFile });
  const operandType = host.getTargetTypeRefForSubject(checkedOperandType, context, noRuntimeCarrierQuery) ??
    host.getTargetTypeRefForSubject(request.left, context, noRuntimeCarrierQuery);
  const runtimeKind = getTypeofRuntimeKind(operandType, { allowNullableUnwrap: false });
  if (runtimeKind === undefined) {
    if (isTypeofOperandConsumedByParentComparison(request.expression, context)) {
      return acceptObservation<CheckedOperationMappingResult>({
        operation: targetOperation("tsonic.csharp.typeof.comparison-operand", "operator", "typeof"),
      }, [{ message: "C# typeof operand is consumed by a parent checked typeof comparison and does not require standalone runtime-kind emission." }]);
    }
    return rejectObservation(csharpProviderDiagnostic(context.extensionId, "CSHARP_TYPEOF_RUNTIME_FACT_NOT_PROVEN", 9100146, "C# typeof expression emission requires a selected provider typeof operator fact."));
  }
  const operationId = `tsonic.csharp.typeof.${runtimeKind}`;
  recordCsharpTargetOperation(context, request.expression, csharpTargetTypeofRuntimeOperation(operationId, runtimeKind), [{ message: "C# typeof runtime operation recorded from checked TSTS operand type." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(operationId, "operator", "typeof"),
  }, [{ message: "C# typeof runtime kind selected from checked TSTS operand type." }]);
}

function isTypeofOperandConsumedByParentComparison(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext,
): boolean {
  const ast = context.compiler?.ast;
  const node = asNodeSubject(subject);
  if (ast === undefined || node === undefined || !ast.is.IsTypeOfExpression(node)) {
    return false;
  }
  const parent = ast.parent(node);
  if (parent === undefined || !ast.is.IsBinaryExpression(parent)) {
    return false;
  }
  const operator = getBinaryOperatorText(ast, parent);
  if (operator !== "===" && operator !== "==" && operator !== "!==" && operator !== "!=") {
    return false;
  }
  const left = asNodeSubject(getNodeField(parent, "Left"));
  const right = asNodeSubject(getNodeField(parent, "Right"));
  const literal = left === node ? right : right === node ? left : undefined;
  if (literal === undefined || !ast.is.IsStringLiteral(literal)) {
    return false;
  }
  const text = ast.text(literal);
  return text === "string" || text === "number" || text === "boolean" || text === "bigint";
}
