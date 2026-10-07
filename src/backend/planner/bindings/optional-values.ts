import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { getCsharpGenericOptionalParts, isCsharpAbsenceTargetType, isCsharpJsValueTargetType } from "../../../target-model/types/runtime-carriers.js";
import type { CsharpExpression } from "../../target-ast/roslyn/index.js";
import { allocateExpressionTemp, type DestructuringPlannerState } from "./binding-state.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { planCsharpPresentValueGuard } from "../expressions/optional-storage.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/scalar-types.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "../expressions/planned-values.js";
import { planCsharpCoalescingValue, planCsharpValueBranch } from "../expressions/planned-value-composition.js";
import { convertCsharpPlannedValue } from "../expressions/planned-value-conversions.js";
import { planCsharpDiscardedStatement } from "../statements/statement-output.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";

export function planCsharpArrayBindingPresence(source: CsharpExpression, index: number, lengthMember: string): CsharpExpression {
  return { kind: "BinaryExpression",
    left: { kind: "SimpleMemberAccessExpression", receiver: source, name: lengthMember },
    operatorToken: { kind: "GreaterThanToken" }, right: { kind: "LiteralExpression", value: index } };
}

export function planCsharpBindingDefaultValue(
  node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  value: CsharpExpression, carrier: TargetTypeRef, defaultValue: CsharpPlannedValue, resultCarrier: TargetTypeRef,
  state: DestructuringPlannerState, presence?: CsharpExpression,
): CsharpPlannedValue | undefined {
  if (carrier.kind === "type-parameter" && getCsharpGenericOptionalParts(carrier) === undefined) {
    const storage = csharpNullableTargetType(carrier);
    const selected = convertCsharpPlannedValue(node, sourceFile, input, diagnostics,
      csharpPlannedValue(carrier, value), storage, "implicit");
    if (selected === undefined || selected.completion.kind !== "value") return undefined;
    const normalized = planCsharpBindingDefaultValue(node, sourceFile, input, diagnostics,
      selected.completion.expression, storage, defaultValue, resultCarrier, state, presence);
    return normalized === undefined ? undefined : {
      prelude: [...selected.prelude, ...normalized.prelude], completion: normalized.completion,
    };
  }
  const element = getCsharpGenericOptionalParts(carrier)?.element ?? getCsharpNullableElementTargetType(carrier);
  const optional = element !== undefined || isCsharpJsValueTargetType(carrier);
  if (presence === undefined && getCsharpGenericOptionalParts(carrier) === undefined &&
    element !== undefined && targetTypeRefEquals(element, resultCarrier)) {
    return planCsharpCoalescingValue(node, sourceFile, input, diagnostics,
      csharpPlannedValue(carrier, value), defaultValue, resultCarrier);
  }
  if (isCsharpAbsenceTargetType(carrier)) {
    const discarded = planCsharpDiscardedStatement(value, carrier);
    const absent = { prelude: [...(discarded === undefined ? [] : [discarded]), ...defaultValue.prelude], completion: defaultValue.completion };
    return presence === undefined ? absent : planCsharpValueBranch(node, sourceFile, input, diagnostics,
      csharpPlannedValue(csharpSourcePrimitiveTargetType("bool"), presence), absent, defaultValue, resultCarrier);
  }
  if (!optional && presence === undefined) return convertCsharpPlannedValue(node, sourceFile, input, diagnostics,
    csharpPlannedValue(carrier, value), resultCarrier, "implicit");
  const name = allocateExpressionTemp(state);
  const reference: CsharpExpression = { kind: "IdentifierName", name };
  const guard = optional ? planCsharpPresentValueGuard(carrier, element ?? carrier, value, name, input.scope.typeParameterNames) : undefined;
  if (optional && guard === undefined) return undefined;
  const condition: CsharpExpression = guard === undefined ? presence! : presence === undefined ? guard.condition
    : { kind: "BinaryExpression", left: presence, operatorToken: { kind: "AmpersandAmpersandToken" }, right: guard.condition };
  const retainStorage = getCsharpGenericOptionalParts(carrier) !== undefined && targetTypeRefEquals(carrier, resultCarrier);
  const present = guard === undefined ? value : retainStorage
    ? reference : guard.value;
  const presentCarrier = guard === undefined || retainStorage ? carrier : element ?? carrier;
  const selected = convertCsharpPlannedValue(node, sourceFile, input, diagnostics,
    csharpPlannedValue(presentCarrier, present), resultCarrier, "implicit");
  return planCsharpValueBranch(node, sourceFile, input, diagnostics,
    csharpPlannedValue(csharpSourcePrimitiveTargetType("bool"), condition),
    selected, defaultValue, resultCarrier);
}
