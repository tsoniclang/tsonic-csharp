import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpClosedTypeTestPlan } from "../../../target-model/operations/type-tests.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { getCsharpRuntimeUnionArms, isCsharpAbsenceTargetType } from "../../../target-model/types/runtime-carriers.js";
import { isCsharpJsValueTargetType } from "../../../target-model/types/runtime-carriers.js";
import { isCsharpValueTypeTargetType } from "../../../target-model/types/identity.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import type { CsharpTypeDefinitions } from "../../../target-model/types/source-union-definitions.js";

export function selectCsharpClosedTypeTestPlan(
  source: TargetTypeRef,
  target: TargetTypeRef,
  active: ReadonlySet<TargetTypeRef> = new Set(),
  definitions?: CsharpTypeDefinitions,
): CsharpClosedTypeTestPlan | undefined {
  if (active.has(source)) return undefined;
  if (isCsharpAbsenceTargetType(source)) return Object.freeze({ kind: "constant", value: false });
  if (isCsharpJsValueTargetType(source)) return Object.freeze({ kind: "js-value" });
  const nested = new Set(active).add(source);
  const element = getCsharpNullableElementTargetType(source);
  if (element !== undefined) {
    const test = selectCsharpClosedTypeTestPlan(element, target, nested, definitions);
    return test === undefined ? undefined : Object.freeze({ kind: "optional", element, test });
  }
  const variants = getCsharpRuntimeUnionArms(source, definitions);
  if (variants !== undefined) {
    const arms = variants.map(carrier => {
      const test = selectCsharpClosedTypeTestPlan(carrier, target, nested, definitions);
      return test === undefined ? undefined : Object.freeze({ carrier, test });
    });
    return arms.length === 0 || arms.some(arm => arm === undefined) ? undefined
      : Object.freeze({ kind: "union", arms: Object.freeze(arms.map(arm => arm!)) });
  }
  if (isCsharpValueTypeTargetType(source)) {
    return Object.freeze({ kind: "constant", value: targetTypeRefEquals(source, target) });
  }
  return source.kind === "target-named" || source.kind === "array"
    ? Object.freeze({ kind: "native" }) : undefined;
}
