import { sourceNumericLiteralIsExactlyRepresentableAsBinaryFloat, type SourceLiteralValue } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import { csharpSourcePrimitiveTargetType, isCsharpIntegralTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { csharpBigIntFitsSourcePrimitive } from "../../conversions/literal-range.js";
import { csharpLiteralIsRepresentableAs } from "../../conversions/literals.js";
import { sourcePrimitiveImplicitlyConverts } from "../../conversions/source-primitives.js";
import { resolveCsharpSourceLiteralTargetType } from "../../conversions/source-literals.js";

export interface CsharpNumericArrayContribution {
  readonly carrier: TargetTypeRef;
  readonly literal: SourceLiteralValue | undefined;
  readonly literalDefault: TargetTypeRef | undefined;
}

export type CsharpInferredNumericArrayElementSelection =
  | { readonly kind: "resolved"; readonly carrier: TargetTypeRef }
  | { readonly kind: "rejected"; readonly reason: string }
  | { readonly kind: "unavailable"; readonly carriers: readonly TargetTypeRef[] };

export function selectCsharpInferredNumericArrayElement(
  contributions: readonly CsharpNumericArrayContribution[],
  checkedElement: TargetTypeRef | undefined,
  destination: TargetTypeRef | undefined,
): CsharpInferredNumericArrayElementSelection {
  const original = Object.freeze(contributions.map(contribution => contribution.carrier));
  const unavailable = (carriers = original): CsharpInferredNumericArrayElementSelection =>
    Object.freeze({ kind: "unavailable", carriers });
  if (contributions.length === 0) return unavailable();
  if (destination !== undefined) return numeric(destination)
    ? Object.freeze({ kind: "resolved", carrier: destination }) : unavailable();
  if (contributions.every(contribution => contribution.literal?.numeric?.kind === "authored")) {
    if (checkedElement === undefined || !numeric(checkedElement) || contributions.some(contribution =>
      !numeric(contribution.carrier) || contribution.literalDefault === undefined ||
      !targetTypeRefEquals(contribution.literalDefault, checkedElement))) return unavailable();
    const defaults = contributions.map(contribution => resolveCsharpSourceLiteralTargetType(contribution.literal));
    const carrier = checkedElement.kind === "source-primitive" && checkedElement.name === "float64"
      ? csharpSourcePrimitiveTargetType(defaults.some(value => value?.kind === "source-primitive" && value.name === "float64")
        ? "float64" : "int64") : checkedElement;
    return contributions.every(contribution => csharpLiteralIsRepresentableAs(contribution.literal, carrier))
      ? Object.freeze({ kind: "resolved", carrier: contributions.every(contribution => targetTypeRefEquals(contribution.carrier, carrier))
        ? contributions[0]!.carrier : carrier })
      : Object.freeze({ kind: "rejected", reason: "An inferred numeric array literal is outside its declared or default native element range." });
  }
  const originalFloating = contributions[0]!.carrier;
  if (originalFloating.kind === "source-primitive" &&
    (originalFloating.name === "float32" || originalFloating.name === "float64") &&
    contributions.every(contribution => targetTypeRefEquals(contribution.carrier, originalFloating) &&
      (contribution.literal?.numeric?.kind !== "authored" || csharpLiteralIsRepresentableAs(contribution.literal, originalFloating)))) {
    return Object.freeze({ kind: "resolved", carrier: originalFloating });
  }
  const allNumeric = contributions.every(contribution => numeric(contribution.carrier));
  const fixed = [...new Map(contributions.filter(contribution => !flexibleInteger(contribution)).map(contribution =>
    [targetTypeRefKey(contribution.carrier), contribution.carrier])).values()];
  const fixedIntegers = fixed.filter(isCsharpIntegralTargetType);
  const incompatibleIntegers = fixedIntegers.some(left => fixedIntegers.some(right =>
    !targetTypeRefEquals(left, right) && !sourcePrimitiveImplicitlyConverts(left, right) && !sourcePrimitiveImplicitlyConverts(right, left)));
  const actualFloating = fixed.some(carrier => carrier.kind === "source-primitive" &&
    (carrier.name === "float32" || carrier.name === "float64"));
  const candidates = [...new Map(contributions.flatMap(contribution => {
    const canonical = flexibleInteger(contribution) ? numericLiteralDefault(contribution) : undefined;
    return [contribution.carrier, ...(canonical === undefined ? [] : [canonical])].map(carrier =>
      [targetTypeRefKey(carrier), carrier] as const);
  })).values()];
  const common = !allNumeric ? [] : candidates.filter(candidate => !(incompatibleIntegers && !actualFloating &&
    candidate.kind === "source-primitive" && (candidate.name === "float32" || candidate.name === "float64")) &&
    contributions.every(contribution => fits(candidate, contribution)));
  const least = common.filter(candidate => common.every(other => targetTypeRefEquals(candidate, other) ||
    sourcePrimitiveImplicitlyConverts(other, candidate)));
  const inferCommon = numeric(checkedElement) || fixed.length === 1 && contributions.some(flexibleInteger);
  if (inferCommon && least.length === 1) return Object.freeze({ kind: "resolved", carrier: least[0]! });
  if (allNumeric && numeric(checkedElement) && fixed.some(carrier => carrier.kind === "source-primitive" && carrier.name === "float32") &&
    contributions.some(contribution => isCsharpIntegralTargetType(contribution.carrier))) return Object.freeze({ kind: "rejected",
    reason: "Inferred array elements require an exact common native numeric carrier; an explicit native array destination is required for a rounding conversion." });
  const carriers: TargetTypeRef[] = [];
  for (const contribution of contributions) {
    if (!flexibleInteger(contribution)) {
      if (contribution.literal?.numeric?.kind === "authored" && numeric(contribution.carrier) &&
        !csharpLiteralIsRepresentableAs(contribution.literal, contribution.carrier)) return Object.freeze({ kind: "rejected",
        reason: "An inferred numeric array literal is outside its declared or default native element range." });
      carriers.push(contribution.carrier);
      continue;
    }
    const canonical = incompatibleIntegers ? numericLiteralDefault(contribution) : contribution.carrier;
    if (canonical === undefined || contribution.literal?.numeric?.kind !== "authored" ||
      (canonical.kind === "source-primitive" && (canonical.name === "float32" || canonical.name === "float64")
        ? !sourceNumericLiteralIsExactlyRepresentableAsBinaryFloat(contribution.literal.numeric.token, canonical.name)
        : !csharpLiteralIsRepresentableAs(contribution.literal, canonical))) {
      return Object.freeze({ kind: "rejected", reason: "An inferred numeric union requires an exact canonical carrier for every authored integer literal." });
    }
    carriers.push(canonical);
  }
  return unavailable(Object.freeze(carriers));
}

function numeric(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "source-primitive" && type.name !== "bool";
}

function flexibleInteger(contribution: CsharpNumericArrayContribution): boolean {
  const literal = contribution.literal;
  const selected = literal?.numeric?.kind === "authored" ? resolveCsharpSourceLiteralTargetType(literal) : undefined;
  return selected?.kind === "source-primitive" && selected.name === "int64";
}

function numericLiteralDefault(contribution: CsharpNumericArrayContribution): TargetTypeRef | undefined {
  const declared = contribution.literalDefault;
  return declared?.kind === "source-primitive" && declared.name === "float64"
    ? resolveCsharpSourceLiteralTargetType(contribution.literal) : declared;
}

function fits(candidate: TargetTypeRef, contribution: CsharpNumericArrayContribution): boolean {
  const { carrier, literal } = contribution;
  if (literal?.numeric?.kind === "authored" && numeric(candidate) &&
    !csharpLiteralIsRepresentableAs(literal, candidate)) return false;
  if (flexibleInteger(contribution) && candidate.kind === "source-primitive" &&
    (candidate.name === "float32" || candidate.name === "float64") && literal?.numeric?.kind === "authored" &&
    !sourceNumericLiteralIsExactlyRepresentableAsBinaryFloat(literal.numeric.token, candidate.name)) return false;
  if (targetTypeRefEquals(candidate, carrier)) return true;
  if (literal?.numeric?.kind === "authored") {
    if (isCsharpIntegralTargetType(candidate) && flexibleInteger(contribution) &&
      csharpLiteralIsRepresentableAs(literal, candidate)) return true;
    if (candidate.kind === "source-primitive" && candidate.name === "float32" &&
      sourceNumericLiteralIsExactlyRepresentableAsBinaryFloat(literal.numeric.token, "float32")) return true;
  }
  if (!sourcePrimitiveImplicitlyConverts(candidate, carrier)) return false;
  if (candidate.kind === "source-primitive" && (candidate.name === "float32" || candidate.name === "float64") &&
    isCsharpIntegralTargetType(carrier) && carrier.kind === "source-primitive") {
    const precision = candidate.name === "float32" ? 24n : 53n;
    return carrier.name === "char" || !csharpBigIntFitsSourcePrimitive((1n << precision) + 1n, carrier.name);
  }
  return true;
}
