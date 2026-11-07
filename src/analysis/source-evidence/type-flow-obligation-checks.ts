// CLR realization of the Host type-flow obligations (facts.obligations()): the Host decided that each obligation's
// Source relation holds; this file proves that the chosen .NET representation can carry it, and otherwise reports a
// .NET-capability refusal (CSHARP_TYPE_FLOW_UNREPRESENTABLE). No Source relation is decided here (R2, I7).
import type { Node } from "@tsonic/tsts";
import type { SourceLiteralValue, SourceObligation, SourcePublishedPlatformFacts, SourceTypeFlowRefusal } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpSourceTypeFlowRelationHost } from "../../policy/types/source-type-flow/relations.js";
import type { CsharpNativeSourceCarrierSelection } from "../../target-model/records/objects/object-shapes.js";
import type { CsharpArrayLiteralSelection } from "../../target-model/records/operations/array-literals.js";
import type { TargetConstraint, TargetTypeRef } from "../../target-model/types/model.js";
import { csharpTargetTypeFailsConstraint, type CsharpConstraintSatisfactionHost } from "../operations/members/calls/constraint-satisfaction.js";
import type { SourceTypeDescriptor } from "@tsonic/target-api/source";
import { csharpSourceTypeFlowInterfaceAccepts } from "../../policy/types/source-type-flow/relations.js";
import { csharpLiteralIsRepresentableAs, selectCsharpExactLiteralConversion } from "../../policy/conversions/literals.js";
import { csharpArrayElementIsRepresentableAs } from "../../policy/types/collections/array-elements.js";
import { conversionIsImplicitlyApplicable, selectCsharpConversion } from "../../policy/conversions/core.js";
import { csharpConversionIsApplicable } from "../../policy/conversions/applicability.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { isCsharpStringTargetType } from "../../target-model/types/identity.js";
import { getCsharpCollectionElementTargetType } from "../../target-model/types/carriers/collections.js";
import { getCsharpRuntimeUnionArms } from "../../target-model/types/carriers/runtime-carriers.js";
import { forwardSourceRefusal } from "../program/source-facts.js";

export interface CsharpSourceTypeFlowObligationHost extends CsharpSourceTypeFlowRelationHost {
  readonly typeDefinitions: CsharpPolicyContext["typeDefinitions"];
  readonly target: CsharpPolicyContext["target"];
  readonly constraintHost: CsharpConstraintSatisfactionHost;
  /** The one mapping at an obligation site (storage position); a CSHARP_ refusal reads as "no representation". */
  represent(descriptor: SourceTypeDescriptor, site: Node): TargetTypeRef | undefined;
  /** The Host platform facts (facts.analyses.platform): native-int literal fits are the Host's (Q89). */
  readonly platform: SourcePublishedPlatformFacts;
  /** The Host literal value of a node (facts.values.literal). */
  literal(node: Node): SourceLiteralValue | undefined;
  valueType(node: Node): TargetTypeRef | undefined;
  arrayLiteral(node: Node): CsharpArrayLiteralSelection;
  literalAdmission(node: Node, type: TargetTypeRef): CsharpNativeSourceCarrierSelection | undefined;
  /** The required contract of an obligation without a published requiredType (the instantiated call parameter). */
  requiredType(obligation: SourceObligation): TargetTypeRef | undefined;
  /**
   * The lowered .NET constraints of the binder an obligation names, with the call's binders substituted; the Host
   * refusal of the binder's authored constraint when the Host refused it.
   */
  nativeConstraints(obligation: SourceObligation, type: TargetTypeRef): readonly TargetConstraint[] | SourceTypeFlowRefusal | undefined;
}

export function checkCsharpSourceTypeFlowObligations(
  host: CsharpSourceTypeFlowObligationHost,
  obligations: readonly SourceObligation[],
): readonly TargetDiagnostic[] {
  return Object.freeze(obligations.flatMap(obligation => {
    const issue = checkCsharpSourceTypeFlowObligation(host, obligation);
    return issue === undefined ? [] : [issue];
  }));
}

/** `chosen` overrides the representation of `obligation.type` (the retained physical shape of an inferred literal). */
export function checkCsharpSourceTypeFlowObligation(
  host: CsharpSourceTypeFlowObligationHost,
  obligation: SourceObligation,
  chosenRepresentation?: TargetTypeRef,
): TargetDiagnostic | undefined {
  const fail = (message: string): TargetDiagnostic => Object.freeze({
    source: "tsonic-csharp",
    sourceNode: obligation.site,
    code: "CSHARP_TYPE_FLOW_UNREPRESENTABLE",
    category: "error",
    message,
  });
  const chosen = chosenRepresentation ?? host.represent(obligation.type, obligation.site);
  if (chosen === undefined) return fail("The Host-selected source type has no closed native C# representation.");
  if (obligation.kind === "constraint") {
    const constraints = host.nativeConstraints(obligation, chosen);
    if (constraints === undefined) return fail("A source constraint requires its actual lowered C# declaration constraints.");
    // A Host refusal of the binder's authored constraint is forwarded unchanged (R5).
    if ("kind" in constraints) return forwardSourceRefusal(constraints);
    for (const constraint of constraints) {
      if (constraint.kind === "implements") {
        if (!csharpSourceTypeFlowInterfaceAccepts(host, chosen, constraint.contract)) {
          return fail(`Native type '${targetTypeRefKey(chosen)}' does not directly implement '${targetTypeRefKey(constraint.contract)}' with identical type arguments.`);
        }
        continue;
      }
      const reason = csharpTargetTypeFailsConstraint(host.constraintHost,
        { kind: "target-derived", targetType: chosen }, constraint);
      if (reason !== undefined) return fail(reason);
    }
    return undefined;
  }
  if (obligation.kind === "literal-admission") {
    if (obligation.authority !== "inferred" && obligation.authority !== "declared") {
      return fail("A Host literal-admission obligation requires its exact inferred or declared authority.");
    }
    const site = obligation.value ?? obligation.site;
    const carrier = getCsharpNullableElementTargetType(chosen) ?? chosen;
    const literal = obligation.authority === "inferred" ? host.literal(site) : undefined;
    const element = getCsharpCollectionElementTargetType(carrier);
    if (obligation.authority === "inferred" && literal?.form === "array" && element !== undefined &&
      (getCsharpRuntimeUnionArms(element, host.typeDefinitions) !== undefined || getCsharpNullableElementTargetType(element) !== undefined)) {
      const selected = host.arrayLiteral(site);
      if (selected.kind === "resolved") for (const [index, value] of literal.elements.entries()) {
        const physical = selected.elementCarriers[index];
        if (physical === undefined || !csharpArrayElementIsRepresentableAs(physical, { carrier: physical, literal: value }, host.platform)) {
          return Object.freeze({ source: "tsonic-csharp", sourceNode: obligation.site, category: "error",
            code: "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH",
            message: "An inferred numeric union requires an exact canonical carrier for every authored integer literal." });
        }
      }
    }
    if (carrier.kind === "source-primitive" || isCsharpStringTargetType(carrier)) {
      const value = obligation.authority === "inferred" ? literal : host.literal(site);
      if (literalFits(value, chosen, host.platform)) return undefined;
      const selection = selectCsharpExactLiteralConversion(value, chosen, chosen, host.platform);
      return fail(selection.kind === "rejected" ? selection.reason
        : `The retained source literal is not representable as '${targetTypeRefKey(chosen)}'.`);
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
      : host.represent(descriptor, obligation.site);
    if (actual === undefined) return fail("A native write check requires the exact projected value's Host-selected representation.");
    const literals = writtenLiteralValues(host, obligation);
    for (const literal of literals) {
      if (literal !== undefined && !writtenLiteralFits(literal, chosen, host.platform)) {
        return fail(`The written literal does not fit the existing '${targetTypeRefKey(chosen)}' storage.`);
      }
    }
    const storage = getCsharpNullableElementTargetType(chosen) ?? chosen;
    if ((storage.kind === "source-primitive" || isCsharpStringTargetType(storage)) &&
      literals.length > 0 && literals.every(literal => literal !== undefined && literal.form !== "array")) return undefined;
    const conversion = selectCsharpConversion(host, actual, chosen, "implicit");
    if (conversion.kind === "identity" || conversion.kind === "absence" || conversion.kind === "js-value-box" ||
      conversion.kind === "union-map" && csharpConversionIsApplicable(conversion, "implicit") || conversion.kind === "implicit" &&
      (conversion.proof === "runtime-union-arm" && conversionIsImplicitlyApplicable(conversion.sourceToArm) ||
        conversion.proof === "numeric" || conversion.proof === "nullable" || (conversion.proof === "reference" || conversion.proof === "collection-interface" ||
        conversion.proof === "object-shape-interface") && csharpSourceTypeFlowInterfaceAccepts(host, actual, chosen))) return undefined;
    return fail(conversion.kind === "rejected" ? conversion.reason
      : `The write requires a native conversion from '${targetTypeRefKey(actual)}' to '${targetTypeRefKey(chosen)}' without changing the binding's type.`);
  }
  const required = obligation.requiredType === undefined
    ? host.requiredType(obligation)
    : host.represent(obligation.requiredType, obligation.site);
  if (required === undefined) return fail("A native type-flow obligation requires its exact declared target contract.");
  if (targetTypeRefEquals(chosen, required)) return undefined;
  return csharpSourceTypeFlowInterfaceAccepts(host, chosen, required) ? undefined
    : fail(`Native type '${targetTypeRefKey(chosen)}' does not directly implement '${targetTypeRefKey(required)}' with identical type arguments.`);
}

function writtenLiteralValues(
  host: Pick<CsharpSourceTypeFlowObligationHost, "literal">,
  obligation: SourceObligation,
): readonly (SourceLiteralValue | undefined)[] {
  const variable = obligation.valueVariable;
  const node = variable?.node ?? obligation.value;
  if (node === undefined) return [];
  let literals: readonly (SourceLiteralValue | undefined)[] = [host.literal(node)];
  for (const part of variable?.path ?? []) {
    if (part.kind === "optional-value") continue;
    if (part.kind !== "element" && part.kind !== "tuple") return [];
    literals = literals.flatMap(literal => literal?.form !== "array" ? [undefined]
      : part.kind === "element" ? literal.elements : [literal.elements[part.index]]);
  }
  return literals;
}

function literalFits(value: SourceLiteralValue | undefined, carrier: TargetTypeRef, platform: SourcePublishedPlatformFacts): boolean {
  const type = getCsharpNullableElementTargetType(carrier) ?? carrier;
  if (type.kind === "tuple") {
    return value?.form === "array" && value.elements.length === type.elements.length &&
      type.elements.every((element, index) => literalFits(value.elements[index], element, platform));
  }
  return csharpLiteralIsRepresentableAs(value, type, platform);
}

function writtenLiteralFits(value: SourceLiteralValue, carrier: TargetTypeRef, platform: SourcePublishedPlatformFacts): boolean {
  const type = getCsharpNullableElementTargetType(carrier) ?? carrier;
  if (value.form !== "array") return type.kind !== "source-primitive" && !isCsharpStringTargetType(type) || literalFits(value, carrier, platform);
  if (type.kind === "tuple") return value.elements.length === type.elements.length &&
    value.elements.every((element, index) => element === undefined || writtenLiteralFits(element, type.elements[index]!, platform));
  const elementType = getCsharpCollectionElementTargetType(type);
  return elementType === undefined || value.elements.every(element => element === undefined || writtenLiteralFits(element, elementType, platform));
}
