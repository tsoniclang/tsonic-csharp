import type { TargetTypeRef } from "../../types/native-type-data.js";
import type { CsharpNativeCallableConversionMembers } from "../../conversions/selection.js";
import { csharpNativeCallableMemberKey } from "../../types/carriers/delegates.js";
import { targetTypeRefKey } from "../../types/equality.js";

export function csharpNativeCallableConversionKey(members: CsharpNativeCallableConversionMembers): string {
  const application = (value: CsharpNativeCallableConversionMembers["sourceApplication"]) => value === undefined ? []
    : [csharpNativeCallableMemberKey(value.original), value.typeArguments.map(argument => targetTypeRefKey(argument))];
  return JSON.stringify([csharpNativeCallableMemberKey(members.source), csharpNativeCallableMemberKey(members.target),
    application(members.sourceApplication), application(members.targetApplication)]);
}

export interface CsharpDelegateContract {
  readonly members: CsharpNativeCallableConversionMembers;
  readonly targetCarrier: TargetTypeRef;
  readonly sourceVoid: boolean;
  readonly targetVoid: boolean;
}

export interface CsharpDelegateContractRecords {
  readonly delegateContract: { readonly get: (source: TargetTypeRef, target: TargetTypeRef, members: CsharpNativeCallableConversionMembers) => CsharpDelegateContract | undefined };
}
