import type { CsharpTargetParameter, TargetTypeRef } from "../../types/model.js";
import type { Node } from "@tsonic/tsts";
import type { CsharpCallableParameterAdapter } from "./callable-adapters.js";

export interface SourceCallableSourceContract extends CsharpCallContract {
  readonly kind: "source";
  readonly sourceDeclaration: Node;
  readonly parameters: readonly Node[];
  readonly nativeParameters: readonly CsharpSourceCallableParameterContract[];
  readonly bodyInputs?: {
    readonly parameters: readonly (CsharpSourceCallableParameterContract & { readonly missing: "none" | "null" | "default" })[];
    readonly adapters: readonly Extract<CsharpCallableParameterAdapter, { readonly kind: "value" | "rest-element" }>[];
  };
}

export interface SourceCallableNativeContract extends CsharpCallContract {
  readonly kind: "native";
  readonly sourceDeclaration?: Node;
}

export type SourceCallableContract = SourceCallableSourceContract | SourceCallableNativeContract;

interface CsharpCallContract {
  readonly nativeSignature: CsharpSourceCallableNativeSignature;
  readonly nativeParameters: readonly CsharpSourceCallParameterContract[];
  readonly returnType: TargetTypeRef;
}

export interface CsharpSourceCallableNativeSignature {
  readonly methodTypeParameterIdentities: readonly string[];
  readonly methodAllowsRefLikeTypeArguments: readonly boolean[];
  readonly receiverTypeOwner?: Node;
  readonly sourceReturnType?: TargetTypeRef;
}

export interface CsharpSourceCallableParameterContract extends CsharpSourceCallParameterContract {
  readonly sourceParameter: Node;
}

export interface CsharpSourceCallParameterContract {
  readonly sourceParameter?: Node;
  readonly targetParameter: CsharpTargetParameter;
}
