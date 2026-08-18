import type { CsharpArtifactGraphScope } from "./engine.js";
import type { CsharpArtifactRequestResult } from "./model.js";
import type { CsharpSourceCallableContract, CsharpSourceCallableArtifactIdentity } from "../../../../policy/types/index.js";
import { accepted, rejected } from "./result.js";
import { csharpSourceCallableContractCandidate } from "../contracts.js";
import { isCsharpSourceCallableArtifactDeclaration } from "../../../../policy/types/index.js";
import { sourceNodeIdentity } from "@tsonic/target-api/source";

export function publishSourceCallable(
  { contracts, dependOn, host, sourceCallableArtifactOwner }: CsharpArtifactGraphScope,
  identity: CsharpSourceCallableArtifactIdentity,
  callable: CsharpSourceCallableContract,
): CsharpArtifactRequestResult {
  if (
    identity.kind === "declaration" &&
    (
      callable.sourceDeclaration !== identity.declaration ||
      !isCsharpSourceCallableArtifactDeclaration(
        host.ast,
        identity.declaration,
      )
    )
  ) {
    return rejected(
      "A C# source-callable contract must be owned by its exact emitted callable declaration.",
    );
  }
  const owner = sourceCallableArtifactOwner(identity);
  if (owner === undefined) {
    return rejected(
      "A C# source-callable contract has no stable compiler-owned declaration identity.",
    );
  }
  const candidate = csharpSourceCallableContractCandidate(owner, callable);
  const committed = contracts.commit(
    candidate.owner,
    candidate.contract,
    candidate.dependencies,
    candidate.artifact,
  );
  if (committed.kind === "rejected") {
    return rejected(committed.reason);
  }
  dependOn(owner, "source-callable-surface");
  return accepted;
}


export function sourceCallable(
  { contracts, dependOn, host, sourceCallableArtifactOwner }: CsharpArtifactGraphScope,
  identity: CsharpSourceCallableArtifactIdentity,
): CsharpSourceCallableContract | undefined {
  if (
    identity.kind === "declaration" &&
    !isCsharpSourceCallableArtifactDeclaration(host.ast, identity.declaration)
  ) {
    return undefined;
  }
  const owner = sourceCallableArtifactOwner(identity);
  if (owner === undefined) {
    return undefined;
  }
  dependOn(owner, "source-callable-surface");
  const artifact = contracts.artifact(owner);
  return artifact?.kind === "source-callable"
    ? artifact.callable
    : undefined;
}


export function sourceCallableArtifactOwner(
  { host }: CsharpArtifactGraphScope,
  identity: CsharpSourceCallableArtifactIdentity,
): string | undefined {
  if (identity.kind === "project-constructor") {
    return identity.targetMemberId.length === 0
      ? undefined
      : `source-callable:project-constructor:${identity.targetMemberId}`;
  }
  const declarationIdentity = sourceNodeIdentity(
    host.ast,
    identity.declaration,
  );
  return declarationIdentity === undefined
    ? undefined
    : `source-callable:declaration:${declarationIdentity}`;
}
