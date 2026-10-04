import type {
  CsharpSourceCallableArtifactIdentity,
  CsharpSourceCallableContract,
} from "../../policy/types/index.js";
import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../target-model/types/model.js";

export interface CsharpCallableContractIndex {
  readonly contracts: readonly CsharpSourceCallableContract[];
  readonly declarationContracts: readonly CsharpSourceCallableContract[];
  closedInputType(declaration: Node): TargetTypeRef | undefined;
  get(
    identity: CsharpSourceCallableArtifactIdentity,
  ): CsharpSourceCallableContract | undefined;
}
