import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { getCsharpGenericOptionalParts, isCsharpAbsenceTargetType, isCsharpJsValueTargetType } from "../../../target-model/types/runtime-carriers.js";
import type { CsharpExpression, CsharpTypeNode } from "../../target-ast/roslyn/index.js";
import { allocateExpressionTemp, type DestructuringPlannerState } from "./binding-state.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { planCsharpOptionalStorageOperation } from "../expressions/optional-storage.js";
import { planCsharpPresentValueGuard } from "../expressions/optional-storage.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/scalar-types.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "../expressions/planned-values.js";
import { planCsharpValueBranch } from "../expressions/planned-value-composition.js";
import { planCsharpDiscardedStatement } from "../statements/statement-output.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";

export function planCsharpArrayBindingPresence(source: CsharpExpression, index: number, lengthMember: string): CsharpExpression {
  return { kind: "BinaryExpression",
    left: { kind: "SimpleMemberAccessExpression", receiver: source, name: lengthMember },
    operatorToken: { kind: "GreaterThanToken" }, right: { kind: "LiteralExpression", value: index } };
}

export function planCsharpCheckedBindingValue(
  value: CsharpExpression, present: CsharpExpression, element: TargetTypeRef, storageType: CsharpTypeNode,
): CsharpExpression {
  const storage = csharpNullableTargetType(element);
  const generic = getCsharpGenericOptionalParts(storage);
  const wrap = generic !== undefined && getCsharpGenericOptionalParts(element) === undefined;
  return { kind: "ConditionalExpression", condition: present,
    whenTrue: wrap ? planCsharpOptionalStorageOperation(storage, "From2", value) : value,
    whenFalse: generic === undefined ? { kind: "DefaultExpression", type: storageType }
      : planCsharpOptionalStorageOperation(storage, "From1", { kind: "LiteralExpression", value: null }) };
}

export function planCsharpBindingDefaultValue(
  node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  value: CsharpExpression, carrier: TargetTypeRef, defaultValue: CsharpPlannedValue, resultCarrier: TargetTypeRef,
  state: DestructuringPlannerState, presence?: CsharpExpression,
): CsharpPlannedValue | undefined {
  const element = getCsharpGenericOptionalParts(carrier)?.element ?? getCsharpNullableElementTargetType(carrier);
  const optional = element !== undefined || isCsharpJsValueTargetType(carrier);
  if (isCsharpAbsenceTargetType(carrier)) {
    const absent = { prelude: [planCsharpDiscardedStatement(value, carrier), ...defaultValue.prelude], completion: defaultValue.completion };
    return presence === undefined ? absent : planCsharpValueBranch(node, sourceFile, input, diagnostics,
      csharpPlannedValue(csharpSourcePrimitiveTargetType("bool"), presence), absent, defaultValue, resultCarrier);
  }
  if (!optional && presence === undefined) return csharpPlannedValue(resultCarrier, value);
  const name = allocateExpressionTemp(state);
  const reference: CsharpExpression = { kind: "IdentifierName", name };
  const guard = optional ? planCsharpPresentValueGuard(carrier, element ?? carrier, value, name, input.scope.typeParameterNames) : undefined;
  if (optional && guard === undefined) return undefined;
  const condition: CsharpExpression = guard === undefined ? presence! : presence === undefined ? guard.condition
    : { kind: "BinaryExpression", left: presence, operatorToken: { kind: "AmpersandAmpersandToken" }, right: guard.condition };
  const present = guard === undefined ? value : getCsharpGenericOptionalParts(carrier) !== undefined && targetTypeRefEquals(carrier, resultCarrier)
    ? reference : guard.value;
  return planCsharpValueBranch(node, sourceFile, input, diagnostics,
    csharpPlannedValue(csharpSourcePrimitiveTargetType("bool"), condition),
    csharpPlannedValue(resultCarrier, present), defaultValue, resultCarrier);
}
