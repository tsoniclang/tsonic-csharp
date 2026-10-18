import type { CsharpSourceCallableArtifactIdentity } from "../../policy/types/index.js";
import type { CsharpCallableTargetClassifications, CsharpSourceCallableContract } from "../../target-model/records/source-callable-contract.js";
import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpNativeCallableCreation } from "../../target-model/records/native-demand.js";

export interface CsharpCallableContractIndex {
  readonly contracts: readonly CsharpSourceCallableContract[];
  readonly declarationContracts: readonly CsharpSourceCallableContract[];
  closedInputType(declaration: Node): TargetTypeRef | undefined;
  get(
    identity: CsharpSourceCallableArtifactIdentity,
  ): CsharpSourceCallableContract | undefined;
}

export interface CsharpCallableCreationIndex {
  readonly callableCreation: {
    readonly get: (expression: Node) => CsharpNativeCallableCreation | undefined;
  };
  readonly callableTarget: CsharpCallableTargetClassifications;
}
