import type { CsharpTargetParameter, TargetTypeRef } from "../types/model.js";
import type { Node } from "@tsonic/tsts";

export interface CsharpSourceCallableSourceContract extends CsharpCallContract {
  readonly kind: "source";
  readonly sourceDeclaration: Node;
  readonly parameters: readonly Node[];
  readonly nativeParameters: readonly CsharpSourceCallableParameterContract[];
}

export interface CsharpSourceCallableNativeContract extends CsharpCallContract {
  readonly kind: "native";
  readonly sourceDeclaration?: Node;
}

export type CsharpSourceCallableContract = CsharpSourceCallableSourceContract | CsharpSourceCallableNativeContract;

interface CsharpCallContract {
  readonly methodTypeParameterIdentities: readonly string[];
  readonly methodAllowsRefLikeTypeArguments: readonly boolean[];
  readonly receiverTypeOwner?: Node;
  readonly nativeParameters: readonly CsharpSourceCallParameterContract[];
  readonly returnType: TargetTypeRef;
  readonly sourceReturnType?: TargetTypeRef;
}

export interface CsharpSourceCallableParameterContract extends CsharpSourceCallParameterContract {
  readonly sourceParameter: Node;
}

export interface CsharpSourceCallParameterContract {
  readonly sourceParameter?: Node;
  readonly targetParameter: CsharpTargetParameter;
}
