import type {
  CsharpSourceCallableArtifactIdentity,
  CsharpSourceCallableContract,
} from "../../policy/types/index.js";

export interface CsharpCallableContractIndex {
  readonly contracts: readonly CsharpSourceCallableContract[];
  readonly declarationContracts: readonly CsharpSourceCallableContract[];
  get(
    identity: CsharpSourceCallableArtifactIdentity,
  ): CsharpSourceCallableContract | undefined;
}
