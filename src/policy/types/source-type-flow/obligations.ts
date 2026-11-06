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
import { csharpLiteralIsRepresentableAs, selectCsharpExactLiteralConversion, selectCsharpScalarLiteralCarrier } from "../../conversions/literals.js";
import { csharpArrayElementIsRepresentableAs } from "../collections/array-elements.js";
import { selectCsharpConversion } from "../../conversions/core.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { isCsharpStringTargetType } from "../../../target-model/types/identity.js";
import { getCsharpCollectionElementTargetType } from "../../../target-model/types/carriers/collections.js";
import { getCsharpRuntimeUnionArms } from "../../../target-model/types/carriers/runtime-carriers.js";

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
    if (obligation.authority !== "inferred" && obligation.authority !== "declared") {
      return fail("A Host literal-admission obligation requires its exact inferred or declared authority.");
    }
    const site = obligation.value ?? obligation.site;
    const carrier = getCsharpNullableElementTargetType(chosen) ?? chosen;
    const literal = obligation.authority === "inferred" ? host.literalValues.literalValue.get(site) : undefined;
    const element = getCsharpCollectionElementTargetType(carrier);
    if (obligation.authority === "inferred" && literal?.form === "array" && element !== undefined &&
      (getCsharpRuntimeUnionArms(element, host.typeDefinitions) !== undefined || getCsharpNullableElementTargetType(element) !== undefined)) {
      for (const value of literal.elements) {
        const physical = selectCsharpScalarLiteralCarrier(value, element, host.typeDefinitions)
          ?? getCsharpNullableElementTargetType(element) ?? element;
        if (!csharpArrayElementIsRepresentableAs(physical, { carrier: physical, literal: value })) {
          return Object.freeze({ source: "tsonic-csharp", sourceNode: obligation.site, category: "error",
            code: "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH",
            message: "An inferred numeric union requires an exact canonical carrier for every authored integer literal." });
        }
      }
    }
    if (carrier.kind === "source-primitive" || isCsharpStringTargetType(carrier)) {
      const value = obligation.authority === "inferred" ? literal : host.literalValues.literalValue.get(site);
      if (literalFits(value, chosen)) return undefined;
      const selection = selectCsharpExactLiteralConversion(value, chosen, chosen);
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
      : representCsharpSourceType(host, descriptor);
    if (actual === undefined) return fail("A native write check requires the exact projected value's Host-selected representation.");
    const literals = writtenLiteralValues(host.literalValues, obligation);
    for (const literal of literals) {
      if (literal !== undefined && !writtenLiteralFits(literal, chosen)) {
        return fail(`The written literal does not fit the existing '${targetTypeRefKey(chosen)}' storage.`);
      }
    }
    if (literals.length > 0 && literals.every(literal => literal !== undefined && literal.form !== "array")) return undefined;
    const conversion = selectCsharpConversion(host, actual, chosen, "implicit");
    if (conversion.kind === "identity" || conversion.kind === "absence" || conversion.kind === "implicit" &&
      (conversion.proof === "numeric" || conversion.proof === "nullable" || (conversion.proof === "reference" || conversion.proof === "collection-interface" ||
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

function writtenLiteralValues(
  index: SourceLiteralIndex,
  obligation: SourceTypeFlowObligation,
): readonly (SourceLiteralValue | undefined)[] {
  const variable = obligation.valueVariable;
  const node = variable?.node ?? obligation.value;
  if (node === undefined) return [];
  let literals: readonly (SourceLiteralValue | undefined)[] = [index.literalValue.get(node)];
  for (const part of variable?.path ?? []) {
    if (part.kind === "optional-value") continue;
    if (part.kind !== "element" && part.kind !== "tuple") return [];
    literals = literals.flatMap(literal => literal?.form !== "array" ? [undefined]
      : part.kind === "element" ? literal.elements : [literal.elements[part.index]]);
  }
  return literals;
}

function literalFits(value: SourceLiteralValue | undefined, carrier: TargetTypeRef): boolean {
  const type = getCsharpNullableElementTargetType(carrier) ?? carrier;
  if (type.kind === "tuple") {
    return value?.form === "array" && value.elements.length === type.elements.length &&
      type.elements.every((element, index) => literalFits(value.elements[index], element));
  }
  return csharpLiteralIsRepresentableAs(value, type);
}

function writtenLiteralFits(value: SourceLiteralValue, carrier: TargetTypeRef): boolean {
  if (value.form !== "array") return literalFits(value, carrier);
  const type = getCsharpNullableElementTargetType(carrier) ?? carrier;
  if (type.kind === "tuple") return value.elements.length === type.elements.length &&
    value.elements.every((element, index) => element === undefined || writtenLiteralFits(element, type.elements[index]!));
  const elementType = getCsharpCollectionElementTargetType(type);
  return elementType !== undefined && value.elements.every(element => element === undefined || writtenLiteralFits(element, elementType));
}
