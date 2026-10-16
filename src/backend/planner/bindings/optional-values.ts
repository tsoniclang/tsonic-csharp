import type { CsharpDefaultValueContract } from "../../../target-model/records/value-projections.js";
import type { CsharpExpression } from "../../target-ast/syntax/index.js";
import { allocateExpressionTemp, type DestructuringPlannerState } from "./binding-state.js";
import { planCsharpPresentValueGuard } from "../expressions/optional-storage.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "../expressions/planned-values.js";
import { planCsharpCoalescingValue, planCsharpValueBranch } from "../expressions/planned-value-composition.js";
import { convertCsharpPlannedValue } from "../expressions/planned-value-conversions.js";
import { planCsharpDiscardedStatement } from "../statements/statement-output.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import { failCsharpPlannerInvariant, unsupportedNodeDiagnostic } from "../diagnostics.js";

export function planCsharpArrayBindingPresence(source: CsharpExpression, index: number, lengthMember: string): CsharpExpression {
  return { kind: "BinaryExpression",
    left: { kind: "SimpleMemberAccessExpression", receiver: source, name: lengthMember },
    operatorToken: { kind: "GreaterThanToken" }, right: { kind: "LiteralExpression", value: index } };
}

export function planCsharpBindingDefaultValue(
  node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  value: CsharpExpression, contract: CsharpDefaultValueContract, defaultValue: CsharpPlannedValue,
  state: DestructuringPlannerState, presence?: CsharpExpression,
): CsharpPlannedValue | undefined {
  if (contract.normalize) {
    const selected = convertCsharpPlannedValue(node, sourceFile, input, diagnostics,
      csharpPlannedValue(contract.source, value), contract.storage, "implicit");
    if (selected === undefined || selected.completion.kind !== "value") return undefined;
    const normalized = render(selected.completion.expression);
    return normalized === undefined ? undefined : {
      prelude: [...selected.prelude, ...normalized.prelude], completion: normalized.completion,
    };
  }
  return render(value);

  function render(value: CsharpExpression): CsharpPlannedValue | undefined {
    const carrier = contract.storage;
    const resultCarrier = contract.target;
    if (contract.presence !== (presence !== undefined)) return failCsharpPlannerInvariant(
      "A native default requires its admitted value or array-presence contract.", node);
    if (contract.kind === "coalesce") {
      return planCsharpCoalescingValue(node, sourceFile, input, diagnostics,
        csharpPlannedValue(carrier, value), defaultValue, resultCarrier);
    }
    if (contract.kind === "absence") {
      const discarded = planCsharpDiscardedStatement(value, carrier);
      const absent = { prelude: [...(discarded === undefined ? [] : [discarded]), ...defaultValue.prelude], completion: defaultValue.completion };
      return presence === undefined ? absent : planCsharpValueBranch(node, sourceFile, input, diagnostics,
        csharpPlannedValue(csharpSourcePrimitiveTargetType("bool"), presence), absent, defaultValue, resultCarrier);
    }
    if (contract.kind === "value") return convertCsharpPlannedValue(node, sourceFile, input, diagnostics,
      csharpPlannedValue(carrier, value), resultCarrier, "implicit");
    const name = allocateExpressionTemp(state);
    const reference: CsharpExpression = { kind: "IdentifierName", name };
    const guard = contract.optional ? planCsharpPresentValueGuard(carrier, contract.guardType, value, name, input.scope.typeParameterNames) : undefined;
    if (contract.optional && guard === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "Native default presence requires its renderable sealed optional payload carrier."));
      return undefined;
    }
    const condition: CsharpExpression = guard === undefined ? presence! : presence === undefined ? guard.condition
      : { kind: "BinaryExpression", left: presence, operatorToken: { kind: "AmpersandAmpersandToken" }, right: guard.condition };
    const present = guard === undefined ? value : contract.retainStorage ? reference : guard.value;
    const selected = convertCsharpPlannedValue(node, sourceFile, input, diagnostics,
      csharpPlannedValue(contract.present, present), resultCarrier, "implicit");
    return planCsharpValueBranch(node, sourceFile, input, diagnostics,
      csharpPlannedValue(csharpSourcePrimitiveTargetType("bool"), condition), selected, defaultValue, resultCarrier);
  }
}
