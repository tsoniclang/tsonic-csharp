import type { CsharpSourceCallableArtifactIdentity } from "./callable-identities.js";
import type { CsharpSourceCallableContract } from "./source-callable-contract.js";
import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../types/model.js";
import type { CsharpNativeCallableCreation } from "./native-demand.js";

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
  readonly callableTarget: {
    readonly get: (expression: Node) => TargetTypeRef | undefined;
  };
}
