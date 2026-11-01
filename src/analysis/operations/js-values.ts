import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";

import type { CsharpJsValueOperationSelection, CsharpJsValueReceiverOperation, CsharpJsValueCallKind } from "../../target-model/operations/js-values.js";
import type { CsharpSourceOperator } from "../../target-model/syntax/operators.js";

import {
  selectCsharpJsValueReceiverOperation, selectCsharpNativeJsValueCallOperation,
  selectCsharpNativeJsValueBinaryOperation, selectCsharpNativeJsValueUnaryOperation,
  selectCsharpNativeJsValueTypeofOperation, selectCsharpNativeJsValueVoidOperation,
  selectCsharpNativeJsValueConditionOperation,
} from "../../policy/operations/js-values/selection.js";
export function selectCsharpJsValueReceiverExpressionOperation(
  input: CsharpPolicyContext, receiver: Node | undefined, sourceFile: SourceFile,
  operation: CsharpJsValueReceiverOperation, optional = false,
): CsharpJsValueOperationSelection {
  return selectCsharpJsValueReceiverOperation(input.types.resolveNode(receiver, sourceFile)?.sourceResult?.selectedType, operation, optional);
}
export function selectCsharpJsValueCallOperation(
  input: CsharpPolicyContext, callee: Node | undefined, receiver: Node | undefined, sourceFile: SourceFile,
  callKind: CsharpJsValueCallKind, optionalCall: boolean,
): CsharpJsValueOperationSelection {
  return selectCsharpNativeJsValueCallOperation(input.types.resolveNode(callee, sourceFile)?.sourceResult?.selectedType,
    callKind === "direct" ? undefined : input.types.resolveNode(receiver, sourceFile)?.sourceResult?.selectedType, callKind, optionalCall);
}
export function selectCsharpJsValueBinaryOperation(
  input: CsharpPolicyContext, left: Node | undefined, right: Node | undefined, sourceFile: SourceFile,
  operator: CsharpSourceOperator | "",
): CsharpJsValueOperationSelection {
  const storage = operator === "??" || operator === "??=" ? input.types.resolveReadStorage(left) : undefined;
  return selectCsharpNativeJsValueBinaryOperation(input.types.resolveNode(left, sourceFile)?.sourceResult?.selectedType, input.types.resolveNode(right, sourceFile)?.sourceResult?.selectedType, storage, operator);
}
export function selectCsharpJsValueUnaryOperation(
  input: CsharpPolicyContext, operand: Node | undefined, sourceFile: SourceFile, operator: CsharpSourceOperator | "",
): CsharpJsValueOperationSelection {
  return selectCsharpNativeJsValueUnaryOperation(input.types.resolveNode(operand, sourceFile)?.sourceResult?.selectedType, operator);
}
export function selectCsharpJsTypeofOperation(
  input: CsharpPolicyContext, operand: Node | undefined, sourceFile: SourceFile,
): CsharpJsValueOperationSelection {
  return selectCsharpNativeJsValueTypeofOperation(input.types.resolveNode(operand, sourceFile)?.sourceResult?.selectedType);
}
export function selectCsharpJsValueVoidOperation(
  input: CsharpPolicyContext, operand: Node | undefined, sourceFile: SourceFile,
): CsharpJsValueOperationSelection {
  return selectCsharpNativeJsValueVoidOperation(input.types.resolveNode(operand, sourceFile)?.sourceResult?.selectedType);
}
export function selectCsharpJsValueCondition(
  input: CsharpPolicyContext, expression: Node | undefined, sourceFile: SourceFile,
): CsharpJsValueOperationSelection {
  return selectCsharpNativeJsValueConditionOperation(input.types.resolveNode(expression, sourceFile)?.sourceResult?.selectedType);
}
