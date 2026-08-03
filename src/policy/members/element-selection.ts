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
} from "../../provider/target-relations/index.js";
import type {
  CsharpTargetMember,
} from "../types/index.js";
import {
  targetTypeRefEquals,
} from "../types/index.js";
import {
  instantiateCsharpProviderBindingMember,
} from "./binding-instantiation.js";
import type {
  CsharpProviderCallSelectionHost,
} from "./call-selection.js";
import {
  resolveCsharpProviderElementRelations,
} from "./provider-operations.js";

type ResolvedSourceElementAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["getResolvedElementAccessInfo"]>
>;
type CsharpProviderSignatureRelation = Extract<
  CsharpProviderTargetRelation,
  { readonly kind: "signature" }
>;

export interface CsharpSelectedProviderElement {
  readonly source: ResolvedSourceElementAccessInfo;
  readonly relation: CsharpProviderSignatureRelation;
  readonly targetMember: CsharpTargetMember;
  readonly targetParameterIndex: number;
}

export type CsharpProviderElementSelection =
  | {
      readonly kind: "resolved";
      readonly element: CsharpSelectedProviderElement;
    }
  | {
      readonly kind: "not-provider";
      readonly source: ResolvedSourceElementAccessInfo;
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

export function selectCsharpProviderElement(
  host: CsharpProviderCallSelectionHost,
  elementAccess: Node,
  sourceFile: SourceFile,
): CsharpProviderElementSelection {
  const source = host.semantics(sourceFile)
    .getResolvedElementAccessInfo(elementAccess);
  if (source === undefined) {
    return {
      kind: "missing",
      reason: "The checker did not resolve an exact source element access.",
    };
  }
  const resolution = resolveCsharpProviderElementRelations(
    host,
    elementAccess,
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
    .filter((relation) => relation.kind === "signature")
    .map((relation) =>
      instantiateProviderElement(host, relation, source, sourceFile))
    .filter(
      (candidate): candidate is CsharpSelectedProviderElement =>
        candidate !== undefined,
    );
  if (candidates.length === 1) {
    return { kind: "resolved", element: candidates[0]! };
  }
  if (candidates.length === 0) {
    return {
      kind: "missing",
      reason:
        "No related C# provider indexer satisfies the exact selected element access.",
    };
  }
  return {
    kind: "ambiguous",
    reason:
      "More than one C# target indexer satisfies the same exact selected provider element access.",
    candidates: candidates.map((candidate) =>
      `${candidate.relation.targetBinding.id}::${candidate.targetMember.id}`),
  };
}

function instantiateProviderElement(
  host: CsharpProviderCallSelectionHost,
  relation: CsharpProviderSignatureRelation,
  source: ResolvedSourceElementAccessInfo,
  sourceFile: SourceFile,
): CsharpSelectedProviderElement | undefined {
  if (
    relation.targetMember.kind !== "indexer" ||
    relation.methodTypeParameters.length !== 0 ||
    relation.parameters.length !== 1
  ) {
    return undefined;
  }
  const parameterRelation = relation.parameters[0]!;
  if (
    parameterRelation.sourceParameterIndex !== 0 ||
    parameterRelation.sourcePassingMode !== "by-value" ||
    parameterRelation.sourceAcceptsOmission ||
    parameterRelation.sourceRest
  ) {
    return undefined;
  }
  const targetMember = instantiateCsharpProviderBindingMember(
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
  const targetParameter = targetMember?.parameters[
    parameterRelation.targetParameterIndex
  ];
  if (
    targetMember === undefined ||
    targetParameter === undefined ||
    targetParameter.passingMode !== parameterRelation.targetPassingMode ||
    !providerReceiverMatchesElement(relation, source) ||
    !targetMemberSupportsAccess(targetMember, source.accessMode)
  ) {
    return undefined;
  }
  if (targetParameter.csharpAcceptsCheckedSourceArgument !== true) {
    const sourceArgumentType = host.types.resolveValue(
      source.argument.expression,
      source.argument.type,
      sourceFile,
    );
    if (
      sourceArgumentType === undefined ||
      !targetTypeRefEquals(sourceArgumentType, targetParameter.type)
    ) {
      return undefined;
    }
  }
  return {
    source,
    relation,
    targetMember,
    targetParameterIndex: parameterRelation.targetParameterIndex,
  };
}

function providerReceiverMatchesElement(
  relation: CsharpProviderSignatureRelation,
  _source: ResolvedSourceElementAccessInfo,
): boolean {
  switch (relation.receiver.kind) {
    case "instance":
      return relation.targetMember.static !== true;
    case "none":
      return relation.targetMember.static === true;
    case "target-parameter":
      return relation.targetMember.parameters[
        relation.receiver.targetParameterIndex
      ] !== undefined;
  }
}

function targetMemberSupportsAccess(
  member: CsharpTargetMember,
  accessMode: ResolvedSourceElementAccessInfo["accessMode"],
): boolean {
  if (member.returnType === undefined) {
    return false;
  }
  return accessMode === "read" ||
    (accessMode === "write" || accessMode === "read-write") &&
      member.readonly !== true;
}
