import type { CsharpArrayLiteralSelection } from "../../../../target-model/records/operations/array-literals.js";
import type { Node } from "@tsonic/tsts";
import { sourceSequenceInputChoice, sourceSequenceInputIsEmpty, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { nextState } from "./state.js";
import { getCsharpCollectionElementTargetType } from "../../../../target-model/types/carriers/collections.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { getCsharpGenericOptionalParts } from "../../../../target-model/types/projections.js";
import { resolveCsharpSourceEffectiveType } from "./effective-types.js";
import { selectCsharpConversion } from "../../../../policy/conversions/core.js";
import { csharpConversionIsApplicable } from "../../../../policy/conversions/applicability.js";
import { selectCsharpExactLiteralConversion, selectCsharpScalarLiteralCarrier } from "../../../../policy/conversions/literals.js";
import { csharpArrayLiteralElisionIssue } from "../../../../policy/types/collections/literal-construction.js";

const unavailable: CsharpArrayLiteralSelection = Object.freeze({ kind: "unavailable" });

export function resolveCsharpArrayLiteralSelection(
  scope: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpArrayLiteralSelection {
  const { host } = scope;
  if (!host.ast.is.IsArrayLiteralExpression(node)) return unavailable;
  const elision = csharpArrayLiteralElisionIssue(host.ast, node);
  if (elision !== undefined) return elision;
  const effective = resolveCsharpSourceEffectiveType(scope, node, state);
  const carrier = effective?.result?.selectedType;
  if (carrier === undefined) return unavailable;
  const presentCarrier = getCsharpGenericOptionalParts(carrier)?.element ?? getCsharpNullableElementTargetType(carrier) ?? carrier;
  const element = getCsharpCollectionElementTargetType(presentCarrier);
  if (presentCarrier.kind !== "tuple" && element === undefined) return unavailable;
  const elements: TargetTypeRef[] = [];
  let rejection: Extract<CsharpArrayLiteralSelection, { readonly kind: "rejected" }> | undefined;
  const fits = (required: TargetTypeRef, actual: TargetTypeRef, value: Node | undefined): boolean => {
    const literal = value === undefined ? undefined : host.literalValues.literalValue.get(value);
    if (literal !== undefined) {
      const selected = selectCsharpExactLiteralConversion(literal, actual, required);
      if (selected.kind === "rejected") {
        rejection ??= Object.freeze({ kind: "rejected", subject: value!, code: "CSHARP_UNSUPPORTED_AST", reason: selected.reason });
        return false;
      }
      if (selected.kind === "resolved" || selected.kind === "source-representation") return true;
    }
    return csharpConversionIsApplicable(selectCsharpConversion({ typeDefinitions: host.typeDefinitions,
        projectTypes: host.projectTypes(), providers: host.providers, target: host.target, objectShapes: host.objectShapes },
      actual, required, "implicit"), "implicit");
  };
  let complete = true;
  let mismatch = false;
  for (const entry of host.ast.elements(node)) {
    if (entry === undefined) {
      complete = false;
      continue;
    }
    if (!host.ast.is.IsSpreadElement(entry)) {
      const selected = scope.resolveNodeWithState(entry, queries.sourceFile, nextState(state));
      if (selected === undefined) complete = false;
      else {
        const required = presentCarrier.kind === "tuple" ? presentCarrier.elements[elements.length] : element;
        const physical = selectCsharpScalarLiteralCarrier(host.literalValues.literalValue.get(entry), required, host.typeDefinitions)
          ?? selected;
        elements.push(physical);
        if (required === undefined || !fits(required, physical, entry)) mismatch = true;
      }
      continue;
    }
    const operand = host.ast.as.AsSpreadElement(entry)?.Expression;
    const choice = operand === undefined ? undefined : sourceSequenceInputChoice(host.ast, operand);
    if (choice === undefined) {
      complete = false;
      continue;
    }
    let contribution: TargetTypeRef | undefined = element;
    for (const expression of choice.inputs) {
      if (sourceSequenceInputIsEmpty(host.ast, expression)) continue;
      const selected = scope.resolveNodeWithState(expression, queries.sourceFile, nextState(state));
      const present = getCsharpGenericOptionalParts(selected)?.element ?? getCsharpNullableElementTargetType(selected) ?? selected;
      if (present === undefined || present.kind !== "tuple" && getCsharpCollectionElementTargetType(present) === undefined) complete = false;
      const carriers = present?.kind === "tuple" ? present.elements : [getCsharpCollectionElementTargetType(present)];
      for (const carrier of carriers) if (carrier !== undefined && element !== undefined &&
        !fits(element, carrier, undefined)) mismatch = true;
      contribution ??= present?.kind === "tuple" ? present.elements[0] : getCsharpCollectionElementTargetType(present);
    }
    if (contribution === undefined) complete = false;
    else elements.push(contribution);
  }
  return !complete ? unavailable : rejection ?? (mismatch ? Object.freeze({ kind: "rejected",
    subject: node, code: "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH",
    reason: "An array element cannot retain the exact Host-selected native element carrier." })
    : Object.freeze({ kind: "resolved", carrier, elementCarriers: Object.freeze(elements) }));
}
