import type { CsharpTargetParameter, TargetTypeRef } from "../types/model.js";
import type { Node } from "@tsonic/tsts";
import type { SourceStorageProjection } from "@tsonic/target-api/analysis";

export interface CsharpCallableTargetClassifications {
  readonly get: (expression: Node) => TargetTypeRef | undefined;
  readonly entry: (declaration: Node) => CsharpSourceCallableContract | undefined;
}

export interface CsharpSourceCallableContract extends CsharpSourceCallContract {
  readonly sourceDeclaration: Node;
  readonly parameters: readonly CsharpSourceCallableParameterContract[];
}

export interface CsharpSourceCallContract {
  readonly sourceDeclaration?: Node;
  readonly methodTypeParameterIdentities: readonly string[];
  readonly methodAllowsRefLikeTypeArguments: readonly boolean[];
  readonly receiverTypeOwner?: Node;
  readonly parameters: readonly CsharpSourceCallParameterContract[];
  readonly returnType: TargetTypeRef;
  readonly sourceReturnType?: TargetTypeRef;
}

export interface CsharpSourceCallableParameterContract extends CsharpSourceCallParameterContract {
  readonly sourceParameter: Node;
  readonly sourceProjection: readonly SourceStorageProjection[];
}

export interface CsharpSourceCallParameterContract {
  readonly sourceParameter?: Node;
  readonly targetParameter: CsharpTargetParameter;
}
