import type {
  ArgumentPassingMode,
  ProviderMemberKey,
  ProviderVirtualDeclarationFact,
} from "@tsonic/tsts";
import type {
  CsharpTargetBindingFact,
  CsharpTargetMember,
} from "../../policy/types/index.js";

export interface CsharpProviderSourceIdentityBase {
  readonly providerId: string;
  readonly providerVersion: string;
  readonly providerModuleId: string;
  readonly moduleSpecifier: string;
  readonly exportId: string;
  readonly exportName: string;
}

export interface CsharpProviderTypeSourceIdentity extends CsharpProviderSourceIdentityBase {
  readonly kind: "type";
}

export interface CsharpProviderValueSourceIdentity extends CsharpProviderSourceIdentityBase {
  readonly kind: "value";
}

export interface CsharpProviderMemberSourceIdentity extends CsharpProviderSourceIdentityBase {
  readonly kind: "member";
  readonly memberId: string;
  readonly memberStatic: boolean;
  readonly memberKey: ProviderMemberKey;
}

export interface CsharpProviderSignatureSourceIdentity extends CsharpProviderSourceIdentityBase {
  readonly kind: "signature";
  readonly memberId?: string;
  readonly memberStatic?: boolean;
  readonly memberKey?: ProviderMemberKey;
  readonly signatureId: string;
}

export type CsharpProviderSourceIdentity =
  | CsharpProviderTypeSourceIdentity
  | CsharpProviderValueSourceIdentity
  | CsharpProviderMemberSourceIdentity
  | CsharpProviderSignatureSourceIdentity;

export type CsharpTargetReceiverRelation =
  | { readonly kind: "none" }
  | { readonly kind: "instance" }
  | {
      readonly kind: "target-parameter";
      readonly targetParameterIndex: number;
    };

export interface CsharpProviderParameterRelation {
  readonly sourceParameterIndex: number;
  readonly targetParameterIndex: number;
  readonly sourcePassingMode: ArgumentPassingMode;
  readonly targetPassingMode: ArgumentPassingMode;
  readonly sourceAcceptsOmission: boolean;
  readonly targetAcceptsOmission: boolean;
  readonly sourceRest: boolean;
  readonly targetParamsArray: boolean;
}

export interface CsharpProviderTypeParameterRelation {
  readonly sourceTypeParameterIndex: number;
  readonly targetTypeParameterIndex: number;
}

export type CsharpProviderTargetRelation =
  | {
      readonly kind: "type";
      readonly source: CsharpProviderTypeSourceIdentity;
      readonly targetBinding: CsharpTargetBindingFact;
      readonly bindingTypeParameters: readonly CsharpProviderTypeParameterRelation[];
    }
  | {
      readonly kind: "value";
      readonly source: CsharpProviderValueSourceIdentity;
      readonly targetBinding: CsharpTargetBindingFact;
      readonly targetMember: CsharpTargetMember;
    }
  | {
      readonly kind: "member";
      readonly source: CsharpProviderMemberSourceIdentity;
      readonly targetBinding: CsharpTargetBindingFact;
      readonly targetMember: CsharpTargetMember;
      readonly receiver: CsharpTargetReceiverRelation;
      readonly bindingTypeParameters: readonly CsharpProviderTypeParameterRelation[];
    }
  | {
      readonly kind: "signature";
      readonly source: CsharpProviderSignatureSourceIdentity;
      readonly targetBinding: CsharpTargetBindingFact;
      readonly targetMember: CsharpTargetMember;
      readonly receiver: CsharpTargetReceiverRelation;
      readonly parameters: readonly CsharpProviderParameterRelation[];
      readonly bindingTypeParameters: readonly CsharpProviderTypeParameterRelation[];
      readonly methodTypeParameters: readonly CsharpProviderTypeParameterRelation[];
    };

export type CsharpProviderIdentityResult<
  TIdentity extends CsharpProviderSourceIdentity = CsharpProviderSourceIdentity,
> =
  | { readonly kind: "resolved"; readonly identity: TIdentity }
  | { readonly kind: "missing"; readonly reason: string };

export function providerTypeSourceIdentity(
  declaration: ProviderVirtualDeclarationFact | undefined,
): CsharpProviderIdentityResult<CsharpProviderTypeSourceIdentity> {
  const base = providerSourceIdentityBase(declaration);
  return base.kind === "missing"
    ? base
    : { kind: "resolved", identity: { kind: "type", ...base.identity } };
}

export function providerValueSourceIdentity(
  declaration: ProviderVirtualDeclarationFact | undefined,
): CsharpProviderIdentityResult<CsharpProviderValueSourceIdentity> {
  const base = providerSourceIdentityBase(declaration);
  return base.kind === "missing"
    ? base
    : { kind: "resolved", identity: { kind: "value", ...base.identity } };
}

export function providerMemberSourceIdentity(
  declaration: ProviderVirtualDeclarationFact | undefined,
): CsharpProviderIdentityResult<CsharpProviderMemberSourceIdentity> {
  const base = providerSourceIdentityBase(declaration);
  if (base.kind === "missing") {
    return base;
  }
  if (
    declaration?.memberId === undefined ||
    declaration.memberStatic === undefined ||
    declaration.memberKey === undefined
  ) {
    return {
      kind: "missing",
      reason: "Selected provider member evidence is missing member id, staticness, or property key.",
    };
  }
  return {
    kind: "resolved",
    identity: {
      kind: "member",
      ...base.identity,
      memberId: declaration.memberId,
      memberStatic: declaration.memberStatic,
      memberKey: declaration.memberKey,
    },
  };
}

export function providerSignatureSourceIdentity(
  declaration: ProviderVirtualDeclarationFact | undefined,
): CsharpProviderIdentityResult<CsharpProviderSignatureSourceIdentity> {
  const base = providerSourceIdentityBase(declaration);
  if (base.kind === "missing") {
    return base;
  }
  if (declaration?.signatureId === undefined) {
    return {
      kind: "missing",
      reason: "Selected provider signature evidence is missing its exact signature id.",
    };
  }
  const hasMemberIdentity =
    declaration.memberId !== undefined ||
    declaration.memberStatic !== undefined ||
    declaration.memberKey !== undefined;
  if (
    hasMemberIdentity &&
    (
      declaration.memberId === undefined ||
      declaration.memberStatic === undefined ||
      declaration.memberKey === undefined
    )
  ) {
    return {
      kind: "missing",
      reason: "Selected provider signature evidence contains an incomplete member identity.",
    };
  }
  return {
    kind: "resolved",
    identity: {
      kind: "signature",
      ...base.identity,
      ...(hasMemberIdentity
        ? {
            memberId: declaration.memberId!,
            memberStatic: declaration.memberStatic!,
            memberKey: declaration.memberKey!,
          }
        : {}),
      signatureId: declaration.signatureId,
    },
  };
}

export interface CsharpProviderRelationCatalog {
  resolveType(source: CsharpProviderTypeSourceIdentity): readonly CsharpProviderTargetRelation[];
  resolveValue(source: CsharpProviderValueSourceIdentity): readonly CsharpProviderTargetRelation[];
  resolveMember(source: CsharpProviderMemberSourceIdentity): readonly CsharpProviderTargetRelation[];
  resolveSignature(source: CsharpProviderSignatureSourceIdentity): readonly CsharpProviderTargetRelation[];
  readonly relations: readonly CsharpProviderTargetRelation[];
}

export function createCsharpProviderRelationCatalog(
  slices: readonly (readonly CsharpProviderTargetRelation[])[],
): CsharpProviderRelationCatalog {
  const relationsByIdentity = new Map<string, CsharpProviderTargetRelation[]>();
  for (const relation of slices.flat()) {
    const key = providerSourceIdentityKey(relation.source);
    const existing = relationsByIdentity.get(key) ?? [];
    const duplicate = existing.find((candidate) =>
      providerTargetRelationIdentity(candidate) === providerTargetRelationIdentity(relation));
    if (duplicate === undefined) {
      existing.push(relation);
      relationsByIdentity.set(key, existing);
      continue;
    }
    if (!providerTargetRelationsEqual(duplicate, relation)) {
      throw new Error(
        `C# provider relation conflict for ${formatProviderSourceIdentity(relation.source)}.`,
      );
    }
  }
  const relations = Object.freeze(
    [...relationsByIdentity.values()].flat().sort((left, right) =>
      providerSourceIdentityKey(left.source).localeCompare(providerSourceIdentityKey(right.source))),
  );
  const resolve = (source: CsharpProviderSourceIdentity): readonly CsharpProviderTargetRelation[] =>
    relationsByIdentity.get(providerSourceIdentityKey(source)) ?? [];
  return Object.freeze({
    resolveType: resolve,
    resolveValue: resolve,
    resolveMember: resolve,
    resolveSignature: resolve,
    relations,
  });
}

function providerTargetRelationIdentity(relation: CsharpProviderTargetRelation): string {
  return relation.kind === "type"
    ? relation.targetBinding.id
    : `${relation.targetBinding.id}\u0000${relation.targetMember.id}`;
}

export function providerSourceIdentityKey(identity: CsharpProviderSourceIdentity): string {
  return JSON.stringify([
    identity.kind,
    identity.providerId,
    identity.providerVersion,
    identity.providerModuleId,
    identity.moduleSpecifier,
    identity.exportId,
    identity.exportName,
    identity.kind === "member" || identity.kind === "signature"
      ? identity.memberId
      : undefined,
    identity.kind === "member" || identity.kind === "signature"
      ? identity.memberStatic
      : undefined,
    identity.kind === "member" || identity.kind === "signature"
      ? providerMemberKeyValue(identity.memberKey)
      : undefined,
    identity.kind === "signature" ? identity.signatureId : undefined,
  ]);
}

function providerSourceIdentityBase(
  declaration: ProviderVirtualDeclarationFact | undefined,
): { readonly kind: "resolved"; readonly identity: CsharpProviderSourceIdentityBase } |
   { readonly kind: "missing"; readonly reason: string } {
  if (declaration === undefined) {
    return { kind: "missing", reason: "Selected source declaration has no provider identity fact." };
  }
  if (declaration.exportId === undefined || declaration.exportName === undefined) {
    return {
      kind: "missing",
      reason: "Selected provider declaration evidence is missing export id or export name.",
    };
  }
  return {
    kind: "resolved",
    identity: {
      providerId: declaration.providerId,
      providerVersion: declaration.providerVersion,
      providerModuleId: declaration.providerModuleId,
      moduleSpecifier: declaration.moduleSpecifier,
      exportId: declaration.exportId,
      exportName: declaration.exportName,
    },
  };
}

function providerMemberKeyValue(key: ProviderMemberKey | undefined): readonly string[] | undefined {
  return key === undefined ? undefined : [key.kind, key.name];
}

function providerTargetRelationsEqual(
  left: CsharpProviderTargetRelation,
  right: CsharpProviderTargetRelation,
): boolean {
  return left.kind === right.kind &&
    canonicalRelationValue(left) === canonicalRelationValue(right);
}

function canonicalRelationValue(
  relation: CsharpProviderTargetRelation,
): string {
  return JSON.stringify(canonicalizeRelationValue(relation));
}

function canonicalizeRelationValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeRelationValue);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalizeRelationValue(child)]),
  );
}

function formatProviderSourceIdentity(identity: CsharpProviderSourceIdentity): string {
  const member = identity.kind === "member" || identity.kind === "signature"
    ? ` member '${identity.memberId ?? "<export>"}'`
    : "";
  const signature = identity.kind === "signature" ? ` signature '${identity.signatureId}'` : "";
  return `provider '${identity.providerId}' module '${identity.moduleSpecifier}' export '${identity.exportName}'${member}${signature}`;
}
