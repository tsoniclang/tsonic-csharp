import type { CsharpSourceCallResult, CsharpTypePolicyHost } from "./model.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { namedTargetTypeImplicitlyAccepts } from "../../conversions/selection/carriers.js";
import { isCsharpJsValueTargetType } from "../../../target-model/types/runtime-carriers.js";
import { retainCsharpBroadValueCarrier } from "./selected-type-evidence.js";

export function selectCsharpSourceCallResult(
  host: CsharpTypePolicyHost,
  nativeType: TargetTypeRef | undefined,
  selected: () => TargetTypeRef | undefined,
): CsharpSourceCallResult | undefined {
  if (nativeType === undefined) return undefined;
  if (isCsharpJsValueTargetType(nativeType)) {
    const selectedType = selected();
    return selectedType === undefined ? undefined : Object.freeze({ nativeType,
      selectedType: retainCsharpBroadValueCarrier(nativeType, selectedType) ?? selectedType });
  }
  const definition = host.projectTypeCatalog.definitionForTarget(nativeType);
  if (definition?.kind !== "class" && definition?.kind !== "interface") {
    return Object.freeze({ nativeType, selectedType: nativeType });
  }
  const selectedType = selected();
  const selectedDefinition = selectedType === undefined ? undefined
    : host.projectTypeCatalog.definitionForTarget(selectedType);
  const related = selectedType !== undefined &&
    (selectedDefinition?.kind === "class" || selectedDefinition?.kind === "interface") &&
    namedTargetTypeImplicitlyAccepts({ projectTypes: host.projectTypes(), providers: host.providers },
      selectedType, nativeType, new Set());
  return Object.freeze({ nativeType, selectedType: related ? selectedType : nativeType });
}
