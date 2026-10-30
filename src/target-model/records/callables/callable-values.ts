import type { CsharpSourceCallableArtifactIdentity } from "./callable-identities.js";
import type { SourceCallableSourceContract, SourceCallableContract } from "./source-callable-contract.js";
import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/model.js";
import type { CsharpNativeCallableCreation } from "../native/native-demand.js";

export interface CsharpCallableContractPublication {
  readonly contracts: readonly SourceCallableContract[];
  readonly declarationContracts: readonly SourceCallableSourceContract[];
  readonly byDeclaration: ReadonlyMap<Node, SourceCallableSourceContract>;
  readonly byProjectConstructor: ReadonlyMap<string, SourceCallableContract>;
  readonly closedInputs: ReadonlyMap<Node, CsharpClosedCallableInput>;
}

export interface CsharpClosedCallableInput {
  readonly type: TargetTypeRef;
  readonly source: SourceCallableSourceContract;
}

export interface CsharpCallableContractIndex {
  readonly contracts: readonly SourceCallableContract[];
  readonly declarationContracts: readonly SourceCallableSourceContract[];
  readonly closedInputs: readonly { readonly declaration: Node; readonly input: CsharpClosedCallableInput }[];
  closedInputType(declaration: Node): TargetTypeRef | undefined;
  closedInputContract(declaration: Node): SourceCallableSourceContract | undefined;
  get(
    identity: Extract<CsharpSourceCallableArtifactIdentity, { readonly kind: "declaration" }>,
  ): SourceCallableSourceContract | undefined;
  get(
    identity: CsharpSourceCallableArtifactIdentity,
  ): SourceCallableContract | undefined;
}

export interface CsharpCallableCreationIndex {
  readonly callableCreation: {
    readonly get: (expression: Node) => CsharpNativeCallableCreation | undefined;
  };
  readonly callableTarget: {
    readonly get: (expression: Node) => TargetTypeRef | undefined;
  };
}
