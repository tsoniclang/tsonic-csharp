import type { CsharpTypePolicyHost } from "./model.js";
import type { CsharpSourceCallResult } from "../../../../target-model/operations/source-call-results.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { namedTargetTypeImplicitlyAccepts } from "../../../../policy/conversions/carriers.js";
import { selectCsharpConversion } from "../../../../policy/conversions/core.js";
import { csharpConversionIsApplicable } from "../../../../policy/conversions/applicability.js";
import { getCsharpRuntimeUnionArms, isCsharpJsValueTargetType } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { retainCsharpBroadValueCarrier } from "../../../../policy/types/resolution/selected-type-evidence.js";
import { getCsharpTaskResultTargetType } from "../../../../target-model/types/carriers/delegates.js";
import { selectCsharpAwaitCompletion } from "../../../../policy/operations/control-flow/await-completions.js";

export function selectCsharpSourceCallResult(
  host: CsharpTypePolicyHost,
  nativeType: TargetTypeRef | undefined,
  selected: () => TargetTypeRef | undefined,
): CsharpSourceCallResult | undefined {
  if (nativeType === undefined) return undefined;
  if (isCsharpJsValueTargetType(nativeType)) {
    const selectedType = selected();
    return selectedType === undefined ? undefined : Object.freeze({ nativeType,
      selectedType: retainCsharpBroadValueCarrier(nativeType, selectedType, false) ?? selectedType });
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

export function completeCsharpSourceCallAdoption(
  host: Pick<CsharpTypePolicyHost, "typeDefinitions">,
  selected: CsharpSourceCallResult | undefined,
): CsharpSourceCallResult | undefined {
  if (selected === undefined) return undefined;
  const payload = getCsharpTaskResultTargetType(selected.nativeType);
  if (payload === undefined) return selected;
  if (getCsharpTaskResultTargetType(payload) === undefined &&
    getCsharpRuntimeUnionArms(getCsharpNullableElementTargetType(payload) ?? payload, host.typeDefinitions) === undefined)
    return selected;
  const native = selectCsharpAwaitCompletion(selected.nativeType, host.typeDefinitions);
  const completion = native === undefined ? undefined : selectCsharpAwaitCompletion(native.result, host.typeDefinitions);
  if (completion === undefined) return undefined;
  if (!completion.alternatives.some(alternative => alternative.task)) return selected;
  if (getCsharpTaskResultTargetType(payload) !== undefined && completion.form === "direct")
    return Object.freeze({ nativeType: selected.nativeType, selectedType: payload, completion });
  if (selected.nativeType.kind !== "target-named") return undefined;
  return Object.freeze({ nativeType: selected.nativeType,
    selectedType: Object.freeze({ ...selected.nativeType, csharpAwaitContinuation: completion }), completion });
}
