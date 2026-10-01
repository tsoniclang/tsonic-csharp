import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpClosedTypePredicate, CsharpClosedTypeTestPlan } from "../../../target-model/operations/type-tests.js";
import { getCsharpJsArrayElementTargetType } from "../../../target-model/types/collections.js";
import { getCsharpTypeofRuntimeKind } from "../../../target-model/types/runtime-kind.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { getCsharpRuntimeUnionArms, isCsharpAbsenceTargetType } from "../../../target-model/types/runtime-carriers.js";
import { isCsharpJsValueTargetType } from "../../../target-model/types/runtime-carriers.js";
import { isCsharpValueTypeTargetType } from "../../../target-model/types/identity.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import type { CsharpTypeDefinitions } from "../../../target-model/types/source-union-definitions.js";
import { csharpStructuralObjectShapeIdentity } from "../../../target-model/types/object-shape-identity.js";

export function selectCsharpClosedTypeTestPlan(
  source: TargetTypeRef,
  predicate: CsharpClosedTypePredicate,
  active: ReadonlySet<TargetTypeRef> = new Set(),
  definitions?: CsharpTypeDefinitions,
): CsharpClosedTypeTestPlan | undefined {
  if (active.has(source)) return undefined;
  if (isCsharpAbsenceTargetType(source)) return Object.freeze({ kind: "constant", value: false });
  if (isCsharpJsValueTargetType(source)) return Object.freeze({ kind: predicate.kind === "array" ? "runtime-array" : "js-value" });
  const nested = new Set(active).add(source);
  const element = getCsharpNullableElementTargetType(source);
  if (element !== undefined) {
    const test = selectCsharpClosedTypeTestPlan(element, predicate, nested, definitions);
    return test === undefined ? undefined : Object.freeze({ kind: "optional", element, test });
  }
  const variants = getCsharpRuntimeUnionArms(source, definitions);
  if (variants !== undefined) {
    const arms = variants.map(carrier => {
      const test = selectCsharpClosedTypeTestPlan(carrier, predicate, nested, definitions);
      return test === undefined ? undefined : Object.freeze({ carrier, test });
    });
    return arms.length === 0 || arms.some(arm => arm === undefined) ? undefined
      : Object.freeze({ kind: "union", arms: Object.freeze(arms.map(arm => arm!)) });
  }
  if (predicate.kind === "array") {
    if (source.kind === "array" || source.kind === "tuple" || getCsharpJsArrayElementTargetType(source) !== undefined) {
      return Object.freeze({ kind: "constant", value: true });
    }
    if (isCsharpValueTypeTargetType(source) || csharpStructuralObjectShapeIdentity(source) !== undefined ||
      source.kind === "target-named" && (source as CsharpTargetNamedTypeRef).csharpJsSurfaceKind !== undefined) {
      return Object.freeze({ kind: "constant", value: false });
    }
    const category = getCsharpTypeofRuntimeKind(source, definitions);
    if (category !== undefined && category !== "object") return Object.freeze({ kind: "constant", value: false });
    return source.kind === "target-named" && !isCsharpValueTypeTargetType(source)
      ? Object.freeze({ kind: "runtime-array" }) : undefined;
  }
  const target = predicate.targetCarrier;
  if (isCsharpValueTypeTargetType(source)) {
    return Object.freeze({ kind: "constant", value: targetTypeRefEquals(source, target) });
  }
  return source.kind === "target-named" || source.kind === "array"
    ? Object.freeze({ kind: "native" }) : undefined;
}
