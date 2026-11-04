import type { Node, SourceFile } from "@tsonic/tsts";
import type { SourceLiteralIndex, SourceLiteralValue, SourceTypeFlowAssociation, SourceTypeFlowObligation } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPolicyContext } from "../../model/context.js";
import type { CsharpSourceTypeRepresentationHost } from "./representation.js";
import type { CsharpSourceTypeFlowRelationHost } from "./relations.js";
import type { CsharpNativeSourceCarrierSelection } from "../../../target-model/records/objects/object-shapes.js";
import type { TargetConstraint, TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpTargetTypeFailsConstraint, type CsharpConstraintSatisfactionHost } from "../../../analysis/operations/members/calls/constraint-satisfaction.js";
import { representCsharpSourceType } from "./representation.js";
import { csharpSourceTypeFlowInterfaceAccepts } from "./relations.js";
import { csharpLiteralIsRepresentableAs } from "../../conversions/literals.js";
import { csharpArrayElementIsRepresentableAs } from "../collections/array-elements.js";
import { selectCsharpConversion } from "../../conversions/core.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { isCsharpStringTargetType } from "../../../target-model/types/identity.js";

export interface CsharpSourceTypeFlowObligationHost extends CsharpSourceTypeRepresentationHost, CsharpSourceTypeFlowRelationHost {
  readonly literalValues: SourceLiteralIndex;
  readonly typeDefinitions: CsharpPolicyContext["typeDefinitions"];
  readonly constraintHost: CsharpConstraintSatisfactionHost;
  valueType(node: Node): TargetTypeRef | undefined;
  literalAdmission(node: Node, type: TargetTypeRef): CsharpNativeSourceCarrierSelection | undefined;
  requiredType(node: Node, association: SourceTypeFlowAssociation | undefined): TargetTypeRef | undefined;
  nativeConstraints(node: Node, type: TargetTypeRef, association: SourceTypeFlowAssociation | undefined): {
    readonly sourceFile: SourceFile;
    readonly constraints: readonly TargetConstraint[];
  } | undefined;
}

export function checkCsharpSourceTypeFlowObligations(
  host: CsharpSourceTypeFlowObligationHost,
  obligations: readonly SourceTypeFlowObligation[],
): readonly TargetDiagnostic[] {
  return Object.freeze(obligations.flatMap(obligation => {
    const issue = checkCsharpSourceTypeFlowObligation(host, obligation);
    return issue === undefined ? [] : [issue];
  }));
}

export function checkCsharpSourceTypeFlowObligation(
  host: CsharpSourceTypeFlowObligationHost,
  obligation: SourceTypeFlowObligation,
): TargetDiagnostic | undefined {
  const fail = (message: string): TargetDiagnostic => Object.freeze({
    source: "tsonic-csharp",
    sourceNode: obligation.site,
    code: "CSHARP_UNSUPPORTED_AST",
    category: "error",
    message,
  });
  const chosen = representCsharpSourceType(host, obligation.type);
  if (chosen === undefined) return fail("The Host-selected source type has no closed native C# representation.");
  if (obligation.kind === "constraint") {
    const selected = host.nativeConstraints(obligation.required, chosen, obligation.association);
    if (selected === undefined) return fail("A source constraint requires its actual lowered C# declaration constraints.");
    for (const constraint of selected.constraints) {
      if (constraint.kind === "implements") {
        if (!csharpSourceTypeFlowInterfaceAccepts(host, chosen, constraint.contract)) {
          return fail(`Native type '${targetTypeRefKey(chosen)}' does not directly implement '${targetTypeRefKey(constraint.contract)}' with identical type arguments.`);
        }
        continue;
      }
      const reason = csharpTargetTypeFailsConstraint(host.constraintHost,
        { kind: "target-derived", targetType: chosen }, constraint, selected.sourceFile);
      if (reason !== undefined) return fail(reason);
    }
    return undefined;
  }
  if (obligation.kind === "literal-admission") {
    const site = obligation.value ?? obligation.site;
    const carrier = getCsharpNullableElementTargetType(chosen) ?? chosen;
    if (carrier.kind === "source-primitive" || isCsharpStringTargetType(carrier)) {
      return literalFits(host.literalValues.literalValue.get(site), chosen) ? undefined
        : fail(`The retained source literal is not representable as '${targetTypeRefKey(chosen)}'.`);
    }
    const admission = host.literalAdmission(site, chosen);
    if (admission?.kind === "rejected") return Object.freeze({
      source: "tsonic-csharp", sourceNode: admission.subject, code: admission.code, category: "error", message: admission.reason,
    });
    return admission !== undefined && targetTypeRefEquals(admission.type, chosen) ? undefined
      : fail("An aggregate literal requires its completed native construction admission for the Host-selected representation.");
  }
  if (obligation.kind === "write-fit") {
    const descriptor = obligation.valueType;
    const actual = descriptor === undefined
      ? obligation.value === undefined || obligation.valueVariable !== undefined ? undefined : host.valueType(obligation.value)
      : representCsharpSourceType(host, descriptor);
    if (actual === undefined) return fail("A native write check requires the exact projected value's Host-selected representation.");
    const literal = obligation.value === undefined || obligation.valueVariable !== undefined &&
      (obligation.valueVariable.node !== obligation.value || obligation.valueVariable.path.length !== 0)
      ? undefined : host.literalValues.literalValue.get(obligation.value);
    if (literal !== undefined) return literalFits(literal, chosen) &&
      (chosen.kind !== "source-primitive" || actual.kind !== "source-primitive" ||
        csharpArrayElementIsRepresentableAs(chosen, { carrier: actual, literal })) ? undefined
      : fail(`The written literal does not fit the existing '${targetTypeRefKey(chosen)}' storage.`);
    const conversion = selectCsharpConversion(host, actual, chosen, "implicit");
    if (conversion.kind === "identity" || conversion.kind === "absence" || conversion.kind === "implicit" &&
      (conversion.proof === "numeric" || (conversion.proof === "reference" || conversion.proof === "collection-interface" ||
        conversion.proof === "object-shape-interface") && csharpSourceTypeFlowInterfaceAccepts(host, actual, chosen))) return undefined;
    return fail(conversion.kind === "rejected" ? conversion.reason
      : `The write requires a native conversion from '${targetTypeRefKey(actual)}' to '${targetTypeRefKey(chosen)}' without changing the binding's type.`);
  }
  const required = obligation.requiredType === undefined
    ? host.requiredType(obligation.required, obligation.association)
    : representCsharpSourceType(host, obligation.requiredType);
  if (required === undefined) return fail("A native type-flow obligation requires its exact declared target contract.");
  if (targetTypeRefEquals(chosen, required)) return undefined;
  return csharpSourceTypeFlowInterfaceAccepts(host, chosen, required) ? undefined
    : fail(`Native type '${targetTypeRefKey(chosen)}' does not directly implement '${targetTypeRefKey(required)}' with identical type arguments.`);
}

function literalFits(value: SourceLiteralValue | undefined, carrier: TargetTypeRef): boolean {
  const type = getCsharpNullableElementTargetType(carrier) ?? carrier;
  if (type.kind === "tuple") {
    return value?.form === "array" && value.elements.length === type.elements.length &&
      type.elements.every((element, index) => literalFits(value.elements[index], element));
  }
  return csharpLiteralIsRepresentableAs(value, type);
}
