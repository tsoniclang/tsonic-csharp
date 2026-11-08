import type { SourcePresence } from "@tsonic/target-api/source";
import type { TargetConstraint, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpNativeTypeEndpoints, CsharpNativeTypeObligation } from "../../../target-model/types/native-obligations.js";
import type { CsharpRepresentationOutcome, CsharpRepresentationView } from "../../../target-model/types/representation.js";
import type { CsharpNativeTypeRelationHost } from "./relations.js";
import { csharpNativeTypeImplements } from "./relations.js";
import { selectCsharpConversion } from "../../conversions/core.js";
import { selectCsharpScalarConversion } from "../../conversions/scalars.js";
import { csharpConversionIsApplicable } from "../../conversions/applicability.js";
import { admitCsharpSourceConversion } from "../../conversions/source-admission.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import { nativeRepresentationFailure, represented } from "./representation-results.js";

export interface CsharpNativeTypeObligationHost extends CsharpNativeTypeRelationHost {
  readonly representation: CsharpRepresentationView;
  readonly target: Parameters<typeof selectCsharpConversion>[0]["target"];
  nativeConstraintFailure(carrier: TargetTypeRef, constraint: TargetConstraint): SourcePresence<string>;
}

export function checkCsharpNativeTypeObligation(host: CsharpNativeTypeObligationHost,
  obligation: CsharpNativeTypeObligation): CsharpRepresentationOutcome<true> {
  const view = host.representation;
  view.source.assertEvidence(obligation.source.evidence);
  if (obligation.kind === "constraint") {
    if (view.source.typeParameter(obligation.parameter.declaration) !== obligation.parameter) {
      throw new TypeError("A Native constraint check requires its exact original Source binder.");
    }
    for (const constraint of obligation.constraints) {
      if (constraint.kind === "implements") {
        if (!csharpNativeTypeImplements(host, obligation.source.carrier, constraint.contract)) return nativeRepresentationFailure(
          obligation.site, "CSHARP_NATIVE_CONSTRAINT_UNSATISFIED",
          `Native type '${targetTypeRefKey(obligation.source.carrier)}' does not directly implement '${targetTypeRefKey(constraint.contract)}' with identical type arguments.`);
      } else {
        const failure = host.nativeConstraintFailure(obligation.source.carrier, constraint);
        if (failure.kind === "present") return nativeRepresentationFailure(obligation.site, "CSHARP_NATIVE_CONSTRAINT_UNSATISFIED", failure.value);
      }
    }
    return represented(true);
  }
  view.source.assertEvidence(obligation.destination.evidence);
  if (obligation.kind === "contract") return csharpNativeTypeImplements(host, obligation.source.carrier, obligation.destination.carrier)
    ? represented(true) : nativeRepresentationFailure(obligation.site, "CSHARP_NATIVE_CONTRACT_MISMATCH",
      `Native type '${targetTypeRefKey(obligation.source.carrier)}' does not implement the exact '${targetTypeRefKey(obligation.destination.carrier)}' contract.`);
  if (obligation.kind === "literal-admission") {
    if (obligation.construction.kind === "none") {
      const value = view.source.scalarLiteral(obligation.source.evidence);
      return value.kind === "present" ? checkWrite(host, obligation, obligation.site)
        : nativeRepresentationFailure(obligation.site, "CSHARP_NATIVE_LITERAL_RECEIPT_MISSING",
          "A Native literal admission requires its original scalar value or complete physical construction receipt.");
    }
    const receipt = obligation.construction.value;
    if (!targetTypeRefEquals(receipt.carrier, obligation.source.carrier)) throw new TypeError("Native literal admission requires the actual sealed construction carrier.");
    if (receipt.kind === "array") {
      if (receipt.construction.kind !== "array" || receipt.construction.value !== obligation.source.evidence ||
        receipt.contributions.length !== receipt.construction.evaluation.length) {
        throw new TypeError("Native array admission requires the same Source construction and its complete authored evaluation vector.");
      }
      for (const [index, contribution] of receipt.contributions.entries()) {
        if (contribution.original !== receipt.construction.evaluation[index]) {
          throw new TypeError("Native array contributions must retain every original evaluation entry in authored order, including empty spreads.");
        }
        view.source.assertEvidence(contribution.original.value);
        if (contribution.original.form === "key" || contribution.original.form === "value" &&
          (contribution.elements.length !== 1 || contribution.elements[0]?.source.evidence !== contribution.original.value)) {
          throw new TypeError("An authored array value requires its identical Source evidence and exactly one physical contribution.");
        }
        for (const element of contribution.elements) {
          view.source.assertEvidence(element.source.evidence);
          view.source.assertEvidence(element.destination.evidence);
          const selected = checkWrite(host, element, element.site);
          if (selected.kind !== "represented") return selected;
        }
      }
    }
  }
  return checkWrite(host, obligation, obligation.site);
}

function checkWrite(host: CsharpNativeTypeObligationHost, endpoints: CsharpNativeTypeEndpoints,
  site: CsharpNativeTypeObligation["site"]): CsharpRepresentationOutcome<true> {
  const literal = host.representation.source.scalarLiteral(endpoints.source.evidence);
  const relation = selectCsharpScalarConversion(host, endpoints.source.carrier, endpoints.destination.carrier, "implicit", literal);
  if (!csharpConversionIsApplicable(relation, "implicit")) return nativeRepresentationFailure(site,
    "CSHARP_NATIVE_WRITE_CARRIER_MISMATCH", relation.kind === "rejected" || relation.kind === "ambiguous" ? relation.reason
      : "The write requires an actual implicit Native conversion without changing the existing storage ABI.");
  const admitted = admitCsharpSourceConversion({ representation: host.representation, relation, ...endpoints, site });
  return admitted.kind !== "represented" ? admitted : represented(true);
}
