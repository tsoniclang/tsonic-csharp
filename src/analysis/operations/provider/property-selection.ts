import type { ExtensionDiagnostic, Node, SourceFile } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpProviderTargetRelation, CsharpTargetReceiverRelation } from "../../../target-model/identities/provider-relations.js";
import type { CsharpTargetMember } from "../../../policy/types/index.js";
import { instantiateCsharpProviderBindingMember } from "../../../policy/operations/members/instantiation/binding-instantiation.js";
import type { CsharpProviderCallSelectionHost } from "./calls/selection.js";
import { resolveCsharpProviderPropertyRelations } from "./relations.js";

type ResolvedSourcePropertyAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["propertyAccess"]>
>;
type CsharpProviderPropertyRelation = Extract<
  CsharpProviderTargetRelation,
  { readonly kind: "member" | "value" }
>;

import { providerReceiverMatchesProperty, csharpProviderPropertySupportsAccess } from "../../../policy/operations/members/property-selection.js";
export interface CsharpSelectedProviderProperty {
  readonly source: ResolvedSourcePropertyAccessInfo;
  readonly relation: CsharpProviderPropertyRelation;
  readonly targetMember: CsharpTargetMember;
  readonly receiver: CsharpTargetReceiverRelation;
}

export type CsharpProviderPropertySelection =
  | {
      readonly kind: "resolved";
      readonly property: CsharpSelectedProviderProperty;
    }
  | {
      readonly kind: "not-provider";
      readonly source: ResolvedSourcePropertyAccessInfo;
      readonly reason: string;
    }
  | {
      readonly kind: "missing" | "conflict";
      readonly reason: string;
    }
  | {
      readonly kind: "ambiguous";
      readonly reason: string;
      readonly candidates: readonly string[];
    }
  | {
      readonly kind: "rejected";
      readonly diagnostic: ExtensionDiagnostic;
    };

export function selectCsharpProviderProperty(
  host: CsharpProviderCallSelectionHost,
  propertyAccess: Node,
  sourceFile: SourceFile,
): CsharpProviderPropertySelection {
  const source = host.semantics(sourceFile)
    .operations.propertyAccess(propertyAccess);
  if (source === undefined) {
    return {
      kind: "missing",
      reason: "The checker did not resolve an exact source property access.",
    };
  }
  const resolution = resolveCsharpProviderPropertyRelations(
    host,
    propertyAccess,
    sourceFile,
  );
  if (resolution.kind === "missing") {
    return {
      kind: "not-provider",
      source,
      reason: resolution.reason,
    };
  }
  if (resolution.kind === "conflict") {
    return { kind: "conflict", reason: resolution.reason };
  }
  if (resolution.kind === "rejected") {
    return resolution;
  }
  const candidates = resolution.relations
    .filter((relation): relation is CsharpProviderPropertyRelation =>
      relation.kind === "member" || relation.kind === "value")
    .map((relation) => {
      const targetMember = relation.kind === "value"
        ? relation.targetMember
        : instantiateCsharpProviderBindingMember(
            host.types,
            relation.targetBinding,
            relation.targetMember,
            relation.bindingTypeParameters,
            relation.bindingTypeArgumentSource === "receiver" ||
                relation.bindingTypeArgumentSource === "callee"
              ? [{
                  node: source.receiver.expression,
                  type: source.receiver.type,
                }]
              : [{
                  type: source.sourceReadType ?? source.sourceWriteType,
                }],
            sourceFile,
          );
      const receiver = relation.kind === "value"
        ? { kind: "none" as const }
        : relation.receiver;
      return targetMember === undefined ||
          !providerReceiverMatchesProperty(receiver, targetMember, source) ||
          !csharpProviderPropertySupportsAccess(targetMember, source.accessMode)
        ? undefined
        : { source, relation, targetMember, receiver };
    })
    .filter(
      (candidate): candidate is CsharpSelectedProviderProperty =>
        candidate !== undefined,
    );
  if (candidates.length === 1) {
    return { kind: "resolved", property: candidates[0]! };
  }
  if (candidates.length === 0) {
    return {
      kind: "missing",
      reason:
        "No related C# provider member satisfies the exact selected property access.",
    };
  }
  return {
    kind: "ambiguous",
    reason:
      "More than one C# target member satisfies the same exact selected provider property.",
    candidates: candidates.map((candidate) =>
      `${candidate.relation.targetBinding.id}::${candidate.targetMember.id}`),
  };
}
