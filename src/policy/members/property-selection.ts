import type {
  ExtensionDiagnostic,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  SourceFileSemantics,
} from "@tsonic/target-api";
import type {
  CsharpProviderTargetRelation,
  CsharpTargetReceiverRelation,
} from "../../provider/target-relations/index.js";
import type {
  CsharpTargetMember,
} from "../types/index.js";
import {
  instantiateCsharpProviderBindingMember,
} from "./binding-instantiation.js";
import type {
  CsharpProviderCallSelectionHost,
} from "./call-selection.js";
import {
  resolveCsharpProviderPropertyRelations,
} from "./provider-operations.js";

type ResolvedSourcePropertyAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["getResolvedPropertyAccessInfo"]>
>;
type CsharpProviderPropertyRelation = Extract<
  CsharpProviderTargetRelation,
  { readonly kind: "member" | "value" }
>;

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
    .getResolvedPropertyAccessInfo(propertyAccess);
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
          !targetMemberSupportsAccess(targetMember, source.accessMode)
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

function providerReceiverMatchesProperty(
  receiver: CsharpTargetReceiverRelation,
  targetMember: CsharpTargetMember,
  source: ResolvedSourcePropertyAccessInfo,
): boolean {
  switch (receiver.kind) {
    case "instance":
      return targetMember.static !== true;
    case "none":
      return targetMember.static === true;
    case "target-parameter":
      return source.receiver.expression !== undefined &&
        targetMember.parameters[
          receiver.targetParameterIndex
        ] !== undefined;
  }
}

function targetMemberSupportsAccess(
  member: CsharpTargetMember,
  accessMode: ResolvedSourcePropertyAccessInfo["accessMode"],
): boolean {
  if (
    member.kind !== "property" &&
    member.kind !== "field" &&
    member.kind !== "event"
  ) {
    return false;
  }
  if (accessMode === "write" || accessMode === "read-write") {
    return member.readonly !== true && member.returnType !== undefined;
  }
  return member.returnType !== undefined;
}
