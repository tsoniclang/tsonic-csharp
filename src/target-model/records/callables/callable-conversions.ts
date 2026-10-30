import type { CsharpDelegateSignatureShape, TargetTypeRef } from "../../types/model.js";

export interface CsharpNativeDelegateExtraction {
  readonly memberIdentity: string;
  readonly owner: TargetTypeRef;
  readonly method: string;
  readonly name: string;
  readonly valueName: string;
  readonly targetCarrier: TargetTypeRef;
  readonly sourceSignature: CsharpDelegateSignatureShape;
  readonly methodTypeArguments: readonly TargetTypeRef[];
}

export interface CsharpDelegateContract {
  readonly sourceSignature: CsharpDelegateSignatureShape;
  readonly targetSignature: CsharpDelegateSignatureShape;
  readonly targetCarrier: TargetTypeRef;
  readonly sourceVoid: boolean;
  readonly targetVoid: boolean;
  readonly methodTypeArguments?: readonly TargetTypeRef[];
  readonly nativeExtraction: CsharpNativeDelegateExtraction | undefined;
}

export interface CsharpDelegateContractRecords {
  readonly delegateContract: {
    readonly get: (source: TargetTypeRef, target: TargetTypeRef) => CsharpDelegateContract | undefined;
    readonly nativeExtractions: () => readonly CsharpNativeDelegateExtraction[];
  };
}
