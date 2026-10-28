import type { Node } from "@tsonic/tsts";
import type { CsharpSourceCallableArtifactIdentity } from "../../../../target-model/records/callables/callable-identities.js";
import type { CsharpCallableContractIndex, CsharpCallableContractPublication } from "../../../../target-model/records/callables/callable-values.js";
import type { SourceCallableSourceContract, SourceCallableContract } from "../../../../target-model/records/callables/source-callable-contract.js";

export function sealCsharpCallableContractIndex(input: CsharpCallableContractPublication): CsharpCallableContractIndex {
  const byDeclaration = new WeakMap(input.byDeclaration);
  const byProjectConstructor = new Map(input.byProjectConstructor);
  const closedInputs = new WeakMap(input.closedInputs);
  function get(identity: Extract<CsharpSourceCallableArtifactIdentity, { readonly kind: "declaration" }>): SourceCallableSourceContract | undefined;
  function get(identity: CsharpSourceCallableArtifactIdentity): SourceCallableContract | undefined;
  function get(identity: CsharpSourceCallableArtifactIdentity): SourceCallableContract | undefined {
    return identity.kind === "declaration" ? byDeclaration.get(identity.declaration) : byProjectConstructor.get(identity.targetMemberId);
  }
  return Object.freeze({
    contracts: Object.freeze([...input.contracts]),
    declarationContracts: Object.freeze([...input.declarationContracts]),
    closedInputs: Object.freeze([...input.closedInputs].map(([declaration, input]) => Object.freeze({ declaration, input }))),
    closedInputType: (declaration: Node) => closedInputs.get(declaration)?.type,
    closedInputContract: (declaration: Node) => closedInputs.get(declaration)?.source,
    get,
  });
}
