import type { CsharpTargetParameter, TargetTypeRef } from "../types/model.js";
import type { Node } from "@tsonic/tsts";

export interface CsharpSourceCallableContract extends CsharpSourceCallContract {
  readonly sourceDeclaration: Node;
  readonly parameters: readonly CsharpSourceCallableParameterContract[];
}

export interface CsharpSourceCallContract {
  readonly sourceDeclaration?: Node;
  readonly methodTypeParameterIdentities: readonly string[];
  readonly receiverTypeOwner?: Node;
  readonly parameters: readonly CsharpSourceCallParameterContract[];
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
