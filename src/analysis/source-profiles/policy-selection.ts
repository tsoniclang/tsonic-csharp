import type { CsharpSourceProfilePropertyPolicyResult } from "../../target-model/records/source-profile-invocations.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import { selectedSourceIndexedDeclarations, selectedSourcePropertyDeclarations, type SourceFileSemantics } from "@tsonic/target-api/source";

import type { TargetTypeRef } from "../../policy/types/index.js";
import type { CsharpProviderCallSelectionHost } from "../../policy/model/provider-calls.js";
import { csharpSourceProfileDeclarationIdentity } from "../../policy/identities/selected-source.js";
import type { CsharpSourceProfileDeclarationIdentity } from "../../policy/identities/selected-source.js";

import type { ResolvedSourceCallInfo } from "../../target-model/records/source-calls.js";

type ResolvedSourcePropertyAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["propertyAccess"]>
>;
type ResolvedSourceElementAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["elementAccess"]>
>;

import { createCsharpSourceProfileInputs } from "./inputs.js";
import { sourceProfilePropertyIdentityMatches, sourceProfileIdentityMatches, selectExactlyOnePolicy } from "../../policy/operations/source-profiles/source-profile-policy.js";
export function selectCsharpSourceProfileCallPolicy(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  policies: readonly CsharpSourceProfileCallPolicy[],
): CsharpSourceProfileCallPolicyResult | undefined {
  const declaration = host.semantics(sourceFile)
    .declarations.signatureDeclaration(source.selectedSignature);
  const semantics = host.semantics(sourceFile);
  const identity = csharpSourceProfileDeclarationIdentity(
    host.ast,
    semantics,
    host.sourceFacts,
    declaration,
  );
  if (identity === undefined) {
    return undefined;
  }
  const matches = policies.filter((policy) =>
    sourceProfileIdentityMatches(policy.source, identity)
  );
  const selected = selectExactlyOnePolicy(matches, identity);
  return selected.kind === "missing"
    ? undefined
    : selected.kind === "ambiguous"
      ? { kind: "rejected", diagnostic: selected.diagnostic }
      : selected.policy.select({ host, source, sourceFile, identity,
        inputs: createCsharpSourceProfileInputs(host, sourceFile, source.sourceReceiver === undefined
          ? source.sourceArguments : [source.sourceReceiver, ...source.sourceArguments], source.sourceResultType,
          source.sourceSelectedMethodTypeArguments ?? []) });
}

export function selectCsharpSourceProfilePropertyPolicy(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourcePropertyAccessInfo,
  sourceFile: SourceFile,
  policies: readonly CsharpSourceProfilePropertyPolicy[],
  receiverType: TargetTypeRef | undefined,
): CsharpSourceProfilePropertyPolicyResult | undefined {
  const identities = sourceProfilePropertyIdentities(
    host,
    source,
    sourceFile,
  );
  const identity = identities[0];
  if (identity === undefined) {
    return undefined;
  }
  const matches = policies.filter((policy) =>
    sourceProfilePropertyIdentityMatches(policy.source, identities)
  );
  const selected = selectExactlyOnePolicy(matches, identity);
  return selected.kind === "missing"
    ? undefined
    : selected.kind === "ambiguous"
      ? { kind: "rejected", diagnostic: selected.diagnostic }
      : selected.policy.select({ host, source, sourceFile, identity,
          inputs: createCsharpSourceProfileInputs(host, sourceFile, [source.receiver], source.sourceReadType ?? source.sourceWriteType),
          receiverType: receiverType ?? host.types.resolveSelectedValue(source.receiver.expression, source.receiver.type, sourceFile),
          readonly: !source.writable });
}

export function sourceProfilePropertyIdentities(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourcePropertyAccessInfo,
  sourceFile: SourceFile,
): readonly CsharpSourceProfileDeclarationIdentity[] {
  const semantics = host.semantics(sourceFile);
  const declarations = selectedSourcePropertyDeclarations(semantics, source.selectedDeclaration, source.selectedSymbol,
    host.types.nativeFlowTypes(source.receiver.expression, source.receiver.type));
  if (declarations === undefined) return [];
  const identities = declarations.map((declaration) =>
    csharpSourceProfileDeclarationIdentity(
      host.ast,
      semantics,
      host.sourceFacts,
      declaration,
    )
  );
  return identities.length > 0 &&
      identities.every(
        (candidate): candidate is CsharpSourceProfileDeclarationIdentity =>
          candidate !== undefined,
      )
    ? identities
    : [];
}

export function selectCsharpSourceProfileElementPolicy(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourceElementAccessInfo,
  sourceFile: SourceFile,
  policies: readonly CsharpSourceProfileElementPolicy[],
): CsharpSourceProfileElementPolicyResult | undefined {
  const semantics = host.semantics(sourceFile);
  const types = host.types.nativeFlowTypes(source.receiver.expression, source.receiver.type) ?? [source.receiver.type];
  if (types.length === 0) return undefined;
  const declarations = new Set<Node>();
  let readonly = false;
  for (const type of types) {
    const selected = semantics.types.selectIndexedAccess(type, source.argument.type);
    const evidence = selectedSourceIndexedDeclarations(semantics, selected);
    if (evidence === undefined) return undefined;
    readonly ||= evidence.readonly;
    for (const declaration of evidence.declarations) declarations.add(declaration);
  }
  const identities = [...declarations].map(declaration => csharpSourceProfileDeclarationIdentity(
    host.ast, semantics, host.sourceFacts, declaration));
  if (identities.some(identity => identity === undefined)) return undefined;
  const identity = identities[0];
  if (identity === undefined) {
    return undefined;
  }
  const matches = policies.filter((policy) =>
    identities.every(candidate => candidate !== undefined && sourceProfileIdentityMatches(policy.source, candidate))
  );
  const selected = selectExactlyOnePolicy(matches, identity);
  return selected.kind === "missing"
    ? undefined
    : selected.kind === "ambiguous"
      ? { kind: "rejected", diagnostic: selected.diagnostic }
      : selected.policy.select({ host, source, sourceFile, identity, readonly,
        inputs: createCsharpSourceProfileInputs(host, sourceFile, [source.receiver, source.argument], source.sourceReadType ?? source.sourceWriteType) });
}
