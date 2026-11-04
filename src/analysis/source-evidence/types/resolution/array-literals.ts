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
import { csharpArrayElementIsRepresentableAs } from "../../../../policy/types/collections/array-elements.js";
import { selectCsharpConversion } from "../../../../policy/conversions/core.js";
import { csharpConversionIsApplicable } from "../../../../policy/conversions/applicability.js";
import { resolveCsharpDeclaredLiteralContext } from "./literal-context.js";
import { getCsharpRuntimeUnionArms } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";

const unavailable: CsharpArrayLiteralSelection = Object.freeze({ kind: "unavailable" });

export function resolveCsharpArrayLiteralSelection(
  scope: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpArrayLiteralSelection {
  const { host } = scope;
  if (!host.ast.is.IsArrayLiteralExpression(node)) return unavailable;
  const effective = resolveCsharpSourceEffectiveType(scope, node, state);
  const context = effective === undefined ? resolveCsharpDeclaredLiteralContext(scope, node, queries, state) : undefined;
  const carrier = effective === undefined ? context?.kind === "selected" ? context.type
    : scope.resolveTypeWithState(queries.types.expressionType(node), queries.sourceFile, nextState(state))
    : effective.result?.selectedType;
  if (carrier === undefined) return unavailable;
  const presentCarrier = getCsharpGenericOptionalParts(carrier)?.element ?? getCsharpNullableElementTargetType(carrier) ?? carrier;
  const element = getCsharpCollectionElementTargetType(presentCarrier);
  if (presentCarrier.kind !== "tuple" && element === undefined) return unavailable;
  const elements: TargetTypeRef[] = [];
  const declared = effective === undefined || effective.outcome.kind !== "refused" &&
    effective.outcome.provenance.component !== undefined;
  let noncanonicalInteger = false;
  const fits = (required: TargetTypeRef, actual: TargetTypeRef, value: Node | undefined): boolean => {
    const literal = value === undefined ? undefined : host.literalValues.literalValue.get(value);
    if (!declared && targetTypeRefEquals(required, actual)) return true;
    if (effective === undefined && context?.kind !== "selected" && literal?.numeric?.kind === "authored" &&
      literal.numeric.token.exponent >= 0n && !(literal.numeric.token.negative && literal.numeric.token.coefficient === 0n)) {
      const present = getCsharpNullableElementTargetType(required);
      const arms = getCsharpRuntimeUnionArms(required, host.typeDefinitions) ?? (present === undefined ? undefined : [present]);
      if (arms !== undefined && !arms.some(arm => csharpArrayElementIsRepresentableAs(arm, { carrier: actual, literal }))) {
        noncanonicalInteger = true;
        return false;
      }
    }
    return required.kind === "source-primitive" && actual.kind === "source-primitive" && (!declared || literal !== undefined)
      ? csharpArrayElementIsRepresentableAs(required, { carrier: actual, literal })
      : csharpConversionIsApplicable(selectCsharpConversion({ typeDefinitions: host.typeDefinitions,
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
        elements.push(selected);
        const required = presentCarrier.kind === "tuple" ? presentCarrier.elements[elements.length - 1] : element;
        if (required === undefined || !fits(required, selected, entry)) mismatch = true;
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
  return !complete ? unavailable : noncanonicalInteger ? Object.freeze({ kind: "rejected",
    reason: "An inferred numeric union requires an exact canonical carrier for every authored integer literal." }) : mismatch ? Object.freeze({ kind: "rejected",
    reason: "An array element cannot retain the exact Host-selected native element carrier." })
    : Object.freeze({ kind: "resolved", carrier, elementCarriers: Object.freeze(elements) });
}
