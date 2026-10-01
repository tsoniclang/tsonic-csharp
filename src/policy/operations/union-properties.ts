import type { ResolvedSourcePropertyAccessInfo, SourceFile } from "@tsonic/tsts";
import type { CsharpProviderCallSelectionHost } from "./members/selection/call-selection.js";
import type { CsharpSourceProfilePropertyPolicyResult } from "./source-profiles/source-profile-policy.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { getCsharpRuntimeUnionArms } from "../../target-model/types/runtime-carriers.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { selectCsharpSourceProfilePropertyForCarrier } from "./source-profiles/source-profile-selection.js";

export interface CsharpUnionProperty {
  readonly kind: "union-property";
  readonly source: ResolvedSourcePropertyAccessInfo;
  readonly unionCarrier: TargetTypeRef;
  readonly selectedVariantIndexes: readonly number[];
  readonly variants: readonly { readonly carrier: TargetTypeRef;
    readonly operation?: Extract<CsharpSourceProfilePropertyPolicyResult, { readonly kind: "resolved" }> }[];
  readonly resultCarrier: TargetTypeRef;
}

export function selectCsharpUnionProperty(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourcePropertyAccessInfo,
  sourceFile: SourceFile,
): CsharpUnionProperty | undefined {
  if (source.accessMode !== "read" || source.optionalChain || source.callCallee) return undefined;
  const carrier = host.types.resolveStorage(source.receiver.expression, sourceFile);
  const variants = getCsharpRuntimeUnionArms(carrier, host.typeDefinitions);
  if (carrier === undefined || variants === undefined) return undefined;
  const guarded = host.types.nativeFlowMembers(source.receiver.expression, carrier);
  if (guarded?.length === 1) return undefined;
  const indexes = variants.flatMap((variant, index) => guarded === undefined ||
    guarded.some(member => targetTypeRefEquals(member, variant)) ? [index] : []);
  if (indexes.length === 0) return undefined;
  const operations = new Map<number, Extract<CsharpSourceProfilePropertyPolicyResult, { readonly kind: "resolved" }>>();
  for (const index of indexes) {
    const selected = selectCsharpSourceProfilePropertyForCarrier(host, source, sourceFile, variants[index]!);
    if (selected?.kind !== "resolved" || selected.receiver.kind !== "instance" || selected.invocation.kind !== "member" ||
      selected.targetMember.static === true || !["field", "property"].includes(selected.targetMember.kind) ||
      selected.targetMember.declaringType === undefined ||
      !targetTypeRefEquals(selected.targetMember.declaringType, variants[index]!)) return undefined;
    operations.set(index, selected);
  }
  const resultCarrier = operations.get(indexes[0]!)!.targetMember.returnType;
  if (resultCarrier === undefined || [...operations.values()].some(operation =>
    operation.targetMember.returnType === undefined || !targetTypeRefEquals(operation.targetMember.returnType, resultCarrier))) return undefined;
  return Object.freeze({ kind: "union-property", source, unionCarrier: carrier,
    selectedVariantIndexes: Object.freeze(indexes), resultCarrier,
    variants: Object.freeze(variants.map((variant, index) => Object.freeze({ carrier: variant,
      ...(operations.has(index) ? { operation: operations.get(index)! } : {}) }))) });
}
