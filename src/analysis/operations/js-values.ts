import type { Node } from "@tsonic/tsts";
import { isCsharpRefusal } from "../../representation/index.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
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
  input: CsharpPolicyContext, receiver: Node | undefined,
  operation: CsharpJsValueReceiverOperation, optional = false,
): CsharpJsValueOperationSelection {
  return selectCsharpJsValueReceiverOperation(valueCarrier(input, receiver), operation, optional);
}
export function selectCsharpJsValueCallOperation(
  input: CsharpPolicyContext, callee: Node | undefined, receiver: Node | undefined,
  callKind: CsharpJsValueCallKind, optionalCall: boolean,
): CsharpJsValueOperationSelection {
  return selectCsharpNativeJsValueCallOperation(valueCarrier(input, callee),
    callKind === "direct" ? undefined : valueCarrier(input, receiver), callKind, optionalCall);
}
export function selectCsharpJsValueBinaryOperation(
  input: CsharpPolicyContext, left: Node | undefined, right: Node | undefined,
  operator: CsharpSourceOperator | "",
): CsharpJsValueOperationSelection {
  const storage = operator === "??" || operator === "??=" ? readCarrier(input, left) : undefined;
  return selectCsharpNativeJsValueBinaryOperation(valueCarrier(input, left), valueCarrier(input, right), storage, operator);
}
export function selectCsharpJsValueUnaryOperation(
  input: CsharpPolicyContext, operand: Node | undefined, operator: CsharpSourceOperator | "",
): CsharpJsValueOperationSelection {
  return selectCsharpNativeJsValueUnaryOperation(valueCarrier(input, operand), operator);
}
export function selectCsharpJsTypeofOperation(
  input: CsharpPolicyContext, operand: Node | undefined,
): CsharpJsValueOperationSelection {
  return selectCsharpNativeJsValueTypeofOperation(valueCarrier(input, operand));
}
export function selectCsharpJsValueVoidOperation(
  input: CsharpPolicyContext, operand: Node | undefined,
): CsharpJsValueOperationSelection {
  return selectCsharpNativeJsValueVoidOperation(valueCarrier(input, operand));
}
export function selectCsharpJsValueCondition(
  input: CsharpPolicyContext, expression: Node | undefined,
): CsharpJsValueOperationSelection {
  return selectCsharpNativeJsValueConditionOperation(valueCarrier(input, expression));
}

/**
 * The represented value of a JS-value operand. A CSHARP_ refusal of the operand is reported at the operand's own value
 * read, so the operation simply is not a JS-value operation here.
 */
function valueCarrier(input: CsharpPolicyContext, node: Node | undefined): TargetTypeRef | undefined {
  if (node === undefined) return undefined;
  const carrier = input.types.value(node);
  return isCsharpRefusal(carrier) ? undefined : carrier;
}

function readCarrier(input: CsharpPolicyContext, node: Node | undefined): TargetTypeRef | undefined {
  if (node === undefined) return undefined;
  const carrier = input.types.readStorage(node);
  return isCsharpRefusal(carrier) ? undefined : carrier;
}
