import type { CsharpDelegateSignatureShape, TargetTypeRef } from "../../types/model.js";

export interface CsharpDelegateContract {
  readonly sourceSignature: CsharpDelegateSignatureShape;
  readonly targetSignature: CsharpDelegateSignatureShape;
  readonly targetCarrier: TargetTypeRef;
  readonly sourceVoid: boolean;
  readonly targetVoid: boolean;
}

export interface CsharpDelegateContractRecords {
  readonly delegateContract: { readonly get: (source: TargetTypeRef, target: TargetTypeRef) => CsharpDelegateContract | undefined };
}
