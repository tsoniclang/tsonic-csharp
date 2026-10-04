import type { CsharpTypePolicyHost } from "./model.js";
import type { CsharpSourceCallResult } from "../../../target-model/operations/source-call-results.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { namedTargetTypeImplicitlyAccepts } from "../../conversions/selection/carriers.js";
import { selectCsharpConversion } from "../../conversions/selection/core.js";
import { csharpConversionIsApplicable } from "../../../target-model/conversions/selection.js";
import { getCsharpRuntimeUnionArms, isCsharpJsValueTargetType } from "../../../target-model/types/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
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
  const nativeElement = getCsharpNullableElementTargetType(nativeType);
  const nativePayload = nativeElement ?? nativeType;
  const closed = getCsharpRuntimeUnionArms(nativePayload, host.typeDefinitions) !== undefined;
  const definition = host.projectTypeCatalog.definitionForTarget(nativePayload);
  if (nativeElement === undefined && !closed && definition?.kind !== "class" && definition?.kind !== "interface") {
    return Object.freeze({ nativeType, selectedType: nativeType });
  }
  const selectedType = selected();
  if (selectedType === undefined) return Object.freeze({ nativeType, selectedType: nativeType });
  const selectedPayload = getCsharpNullableElementTargetType(selectedType) ?? selectedType;
  const selectedDefinition = host.projectTypeCatalog.definitionForTarget(selectedPayload);
  const related = (definition?.kind === "class" || definition?.kind === "interface") &&
    (selectedDefinition?.kind === "class" || selectedDefinition?.kind === "interface") &&
    namedTargetTypeImplicitlyAccepts({ projectTypes: host.projectTypes(), providers: host.providers },
      selectedPayload, nativePayload, new Set());
  if (nativeElement !== undefined || closed) {
    const exact = closed || related || targetTypeRefEquals(nativePayload, selectedPayload);
    const conversion = exact ? selectCsharpConversion({
      typeDefinitions: host.typeDefinitions,
      projectTypes: host.projectTypes(),
      providers: host.providers,
      target: host.target,
    }, nativeType, selectedType, "explicit") : undefined;
    return Object.freeze({ nativeType, selectedType: conversion !== undefined &&
      csharpConversionIsApplicable(conversion, "explicit") ? selectedType : nativeType });
  }
  return Object.freeze({ nativeType, selectedType: related ? selectedType : nativeType });
}
