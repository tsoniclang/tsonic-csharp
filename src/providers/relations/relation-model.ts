import type {
  ArgumentPassingMode,
  ExtensionDiagnostic,
  ProviderMemberKey,
  ProviderVirtualDeclarationFact,
} from "@tsonic/tsts";
import type {
  CsharpTargetBindingFact,
  CsharpTargetMember,
  TargetTypeRef,
} from "../../policy/types/model/definitions.js";
import {
  canonicalProviderValue,
} from "../model/canonical-value.js";

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

export type CsharpProviderArgumentAdapter =
  | {
      readonly kind: "static-method";
      readonly id: string;
      readonly declaringType: TargetTypeRef;
      readonly targetName: string;
      readonly inputType: TargetTypeRef;
      readonly resultType: TargetTypeRef;
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
  readonly argumentAdapter?: CsharpProviderArgumentAdapter;
}

export interface CsharpProviderTypeParameterRelation {
  readonly sourceTypeParameterIndex: number;
  readonly targetTypeParameterIndex: number;
}

export type CsharpProviderBindingTypeArgumentSource =
  | "receiver"
  | "result"
  | "callee"
  | "selected-operation-type-arguments";

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
      readonly bindingTypeArgumentSource: Exclude<
        CsharpProviderBindingTypeArgumentSource,
        "selected-operation-type-arguments"
      >;
    }
  | {
      readonly kind: "signature";
      readonly source: CsharpProviderSignatureSourceIdentity;
      readonly targetBinding: CsharpTargetBindingFact;
      readonly targetMember: CsharpTargetMember;
      readonly receiver: CsharpTargetReceiverRelation;
      readonly parameters: readonly CsharpProviderParameterRelation[];
      readonly bindingTypeParameters: readonly CsharpProviderTypeParameterRelation[];
      readonly bindingTypeArgumentSource: CsharpProviderBindingTypeArgumentSource;
      readonly methodTypeParameters: readonly CsharpProviderTypeParameterRelation[];
    };

export interface CsharpProviderTargetRejection {
  readonly source: CsharpProviderSourceIdentity;
  readonly diagnostic: CsharpProviderTargetRejectionDiagnostic;
}

export interface CsharpProviderTargetRejectionDiagnostic
  extends Pick<
    ExtensionDiagnostic,
    "extensionId" | "extensionCode" | "numericCode" | "message"
  > {
  readonly category: "error";
  readonly evidence?: readonly { readonly message: string }[];
}

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
    assertCsharpProviderTargetRelationContract(relation);
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

export interface CsharpProviderRejectionCatalog {
  resolve(
    source: CsharpProviderSourceIdentity,
  ): CsharpProviderTargetRejectionDiagnostic | undefined;
  readonly rejections: readonly CsharpProviderTargetRejection[];
}

export function createCsharpProviderRejectionCatalog(
  slices: readonly (readonly CsharpProviderTargetRejection[])[],
): CsharpProviderRejectionCatalog {
  const rejectionsByIdentity = new Map<string, CsharpProviderTargetRejection>();
  for (const rejection of slices.flat()) {
    assertCsharpProviderTargetRejectionContract(rejection);
    const key = providerSourceIdentityKey(rejection.source);
    const existing = rejectionsByIdentity.get(key);
    if (existing === undefined) {
      rejectionsByIdentity.set(key, rejection);
      continue;
    }
    if (!providerTargetRejectionsEqual(existing, rejection)) {
      throw new Error(
        `C# provider rejection conflict for ${formatProviderSourceIdentity(rejection.source)}.`,
      );
    }
  }
  const rejections = Object.freeze(
    [...rejectionsByIdentity.values()].sort((left, right) =>
      providerSourceIdentityKey(left.source).localeCompare(
        providerSourceIdentityKey(right.source),
      )),
  );
  return Object.freeze({
    resolve(
      source: CsharpProviderSourceIdentity,
    ): CsharpProviderTargetRejectionDiagnostic | undefined {
      return rejectionsByIdentity.get(providerSourceIdentityKey(source))
        ?.diagnostic;
    },
    rejections,
  });
}

export function assertCsharpProviderPolicyIsNonContradictory(
  relationCatalog: CsharpProviderRelationCatalog,
  rejectionCatalog: CsharpProviderRejectionCatalog,
): void {
  for (const rejection of rejectionCatalog.rejections) {
    const relations = rejection.source.kind === "type"
      ? relationCatalog.resolveType(rejection.source)
      : rejection.source.kind === "value"
        ? relationCatalog.resolveValue(rejection.source)
        : rejection.source.kind === "member"
          ? relationCatalog.resolveMember(rejection.source)
          : relationCatalog.resolveSignature(rejection.source);
    if (relations.length > 0) {
      throw new Error(
        `C# provider policy maps and rejects the same exact ${formatProviderSourceIdentity(rejection.source)}.`,
      );
    }
  }
}

export function assertCsharpProviderTargetRelationContract(
  relation: CsharpProviderTargetRelation,
): void {
  assertCsharpProviderSourceIdentityContract(relation.source);
  if (
    relation.source.kind !== relation.kind ||
    relation.targetBinding.target !== "csharp" ||
    relation.targetBinding.id.length === 0
  ) {
    throw new Error(
      "C# provider relation has contradictory source kind or target binding identity.",
    );
  }
  if (relation.kind === "value") {
    if (
      relation.targetMember.id.length === 0 ||
      relation.targetMember.declaringType === undefined ||
      relation.targetMember.static !== true ||
      (
        relation.targetMember.kind !== "property" &&
        relation.targetMember.kind !== "field"
      )
    ) {
      throw new Error(
        "C# provider value relation must target an exact static property or field.",
      );
    }
    return;
  }
  assertCompleteTypeParameterRelation(
    relation.bindingTypeParameters,
    relation.targetBinding.typeParameters?.length ?? 0,
    "binding",
  );
  if (relation.kind === "type") {
    return;
  }
  if (
    relation.targetMember.id.length === 0 ||
    relation.targetMember.declaringType === undefined
  ) {
    throw new Error(
      "C# provider member relation requires an exact target member and declaring type.",
    );
  }
  assertReceiverRelation(relation);
  if (relation.kind === "member") {
    if (
      relation.targetMember.kind !== "property" &&
      relation.targetMember.kind !== "field" &&
      relation.targetMember.kind !== "event"
    ) {
      throw new Error(
        "C# provider member relation must target a property, field, or event.",
      );
    }
    return;
  }
  if (
    relation.targetMember.kind !== "method" &&
    relation.targetMember.kind !== "constructor" &&
    relation.targetMember.kind !== "indexer" &&
    relation.targetMember.kind !== "operator"
  ) {
    throw new Error(
      "C# provider signature relation must target a callable member or indexer.",
    );
  }
  assertCompleteTypeParameterRelation(
    relation.methodTypeParameters,
    relation.targetMember.typeParameters?.length ?? 0,
    "method",
  );
  assertMethodTypeArgumentProjections(relation.targetMember);
  assertParameterRelations(relation);
}

export function assertCsharpProviderTargetRejectionContract(
  rejection: CsharpProviderTargetRejection,
): void {
  assertCsharpProviderSourceIdentityContract(rejection.source);
  if (
    rejection.diagnostic.category !== "error" ||
    rejection.diagnostic.extensionId.length === 0 ||
    rejection.diagnostic.extensionCode.length === 0 ||
    !Number.isSafeInteger(rejection.diagnostic.numericCode) ||
    rejection.diagnostic.numericCode <= 0
  ) {
    throw new Error(
      "C# provider rejection requires one exact error diagnostic.",
    );
  }
}

function assertCsharpProviderSourceIdentityContract(
  source: CsharpProviderSourceIdentity,
): void {
  if (
    source.providerId.length === 0 ||
    source.providerVersion.length === 0 ||
    source.providerModuleId.length === 0 ||
    source.moduleSpecifier.length === 0 ||
    source.exportId.length === 0 ||
    source.exportName.length === 0
  ) {
    throw new Error("C# provider source identity is incomplete.");
  }
  if (source.kind === "member") {
    if (
      source.memberId.length === 0 ||
      typeof source.memberStatic !== "boolean" ||
      !providerMemberKeyIsValid(source.memberKey)
    ) {
      throw new Error("C# provider member source identity is incomplete.");
    }
    return;
  }
  if (source.kind === "signature") {
    if (source.signatureId.length === 0) {
      throw new Error("C# provider signature source identity is incomplete.");
    }
    const memberFields = [
      source.memberId,
      source.memberStatic,
      source.memberKey,
    ];
    const memberFieldCount = memberFields.filter((field) =>
      field !== undefined
    ).length;
    if (memberFieldCount !== 0 && memberFieldCount !== memberFields.length) {
      throw new Error(
        "C# provider signature source identity has partial member provenance.",
      );
    }
    if (
      memberFieldCount > 0 &&
      (
        source.memberId?.length === 0 ||
        typeof source.memberStatic !== "boolean" ||
        !providerMemberKeyIsValid(source.memberKey)
      )
    ) {
      throw new Error(
        "C# provider signature source identity has invalid member provenance.",
      );
    }
  }
}

function providerMemberKeyIsValid(key: ProviderMemberKey | undefined): boolean {
  return key !== undefined &&
    (key.kind === "property-key" || key.kind === "well-known-symbol") &&
    key.name.length > 0;
}

function assertMethodTypeArgumentProjections(
  member: CsharpTargetMember,
): void {
  const projections = member.csharpMethodTypeArgumentProjections ?? [];
  const targetArity = member.typeParameters?.length ?? 0;
  const seen = new Set<number>();
  for (const projection of projections) {
    if (
      !Number.isSafeInteger(projection.targetTypeParameterIndex) ||
      projection.targetTypeParameterIndex < 0 ||
      projection.targetTypeParameterIndex >= targetArity ||
      seen.has(projection.targetTypeParameterIndex)
    ) {
      throw new Error(
        "C# provider method type-argument projections contain a duplicate or out-of-range target type parameter.",
      );
    }
    seen.add(projection.targetTypeParameterIndex);
  }
}

function assertReceiverRelation(
  relation: Exclude<
    CsharpProviderTargetRelation,
    { readonly kind: "type" | "value" }
  >,
): void {
  const sourceIsExport = relation.source.memberId === undefined;
  const sourceStatic = relation.source.memberStatic;
  const targetStatic = relation.targetMember.static === true;
  switch (relation.receiver.kind) {
    case "none":
      if (
        relation.targetMember.kind !== "constructor" &&
        (
          !targetStatic ||
          (!sourceIsExport && sourceStatic !== true)
        )
      ) {
        throw new Error(
          "C# provider receiver relation 'none' requires a constructor, a module-export signature, or an exact static source-to-target member relation.",
        );
      }
      return;
    case "instance":
      if (targetStatic || sourceStatic !== false) {
        throw new Error(
          "C# provider instance receiver relation contradicts source or target staticness.",
        );
      }
      return;
    case "target-parameter": {
      const receiver = relation.targetMember.parameters[
        relation.receiver.targetParameterIndex
      ];
      if (
        sourceStatic !== false ||
        !targetStatic ||
        relation.targetMember.receiverPassing !== "first-argument" ||
        receiver === undefined
      ) {
        throw new Error(
          "C# provider target-parameter receiver relation requires an instance-shaped source member and an exact static first-argument target receiver.",
        );
      }
    }
  }
}

function assertCompleteTypeParameterRelation(
  relations: readonly CsharpProviderTypeParameterRelation[],
  targetArity: number,
  role: "binding" | "method",
): void {
  if (relations.length !== targetArity) {
    throw new Error(
      `C# provider ${role} type-parameter relation does not cover the exact target arity.`,
    );
  }
  const sourceIndexes = new Set<number>();
  const targetIndexes = new Set<number>();
  for (const relation of relations) {
    if (
      !Number.isSafeInteger(relation.sourceTypeParameterIndex) ||
      !Number.isSafeInteger(relation.targetTypeParameterIndex) ||
      relation.sourceTypeParameterIndex < 0 ||
      relation.sourceTypeParameterIndex >= relations.length ||
      relation.targetTypeParameterIndex < 0 ||
      relation.targetTypeParameterIndex >= targetArity ||
      sourceIndexes.has(relation.sourceTypeParameterIndex) ||
      targetIndexes.has(relation.targetTypeParameterIndex)
    ) {
      throw new Error(
        `C# provider ${role} type-parameter relation is incomplete, duplicated, or out of range.`,
      );
    }
    sourceIndexes.add(relation.sourceTypeParameterIndex);
    targetIndexes.add(relation.targetTypeParameterIndex);
  }
}

function assertParameterRelations(
  relation: Extract<
    CsharpProviderTargetRelation,
    { readonly kind: "signature" }
  >,
): void {
  const receiverIndex = relation.receiver.kind === "target-parameter"
    ? relation.receiver.targetParameterIndex
    : undefined;
  if (
    relation.parameters.length !==
      relation.targetMember.parameters.length -
        (receiverIndex === undefined ? 0 : 1)
  ) {
    throw new Error(
      "C# provider parameter relation does not cover the exact target signature.",
    );
  }
  const sourceIndexes = new Set<number>();
  const targetIndexes = new Set<number>();
  for (const parameter of relation.parameters) {
    const target = relation.targetMember.parameters[
      parameter.targetParameterIndex
    ];
    if (
      !Number.isSafeInteger(parameter.sourceParameterIndex) ||
      !Number.isSafeInteger(parameter.targetParameterIndex) ||
      parameter.sourceParameterIndex < 0 ||
      parameter.sourceParameterIndex >= relation.parameters.length ||
      parameter.targetParameterIndex < 0 ||
      target === undefined ||
      parameter.targetParameterIndex === receiverIndex ||
      sourceIndexes.has(parameter.sourceParameterIndex) ||
      targetIndexes.has(parameter.targetParameterIndex) ||
      parameter.targetPassingMode !== target.passingMode ||
      parameter.targetAcceptsOmission !==
        (
          target.optional === true ||
          target.csharpOmittableOptionalArgument === true ||
          target.paramsArray === true
        ) ||
      parameter.targetParamsArray !== (target.paramsArray === true) ||
      !providerArgumentAdapterIsValid(parameter)
    ) {
      throw new Error(
        "C# provider parameter relation is incomplete, contradictory, duplicated, or out of range.",
      );
    }
    sourceIndexes.add(parameter.sourceParameterIndex);
    targetIndexes.add(parameter.targetParameterIndex);
  }
}

function providerArgumentAdapterIsValid(
  parameter: CsharpProviderParameterRelation,
): boolean {
  const adapter = parameter.argumentAdapter;
  if (adapter === undefined) {
    return true;
  }
  switch (adapter.kind) {
    case "static-method":
      return parameter.sourcePassingMode === "by-value" &&
        parameter.targetPassingMode === "by-value" &&
        adapter.id.length > 0 &&
        adapter.targetName.length > 0;
    default:
      return false;
  }
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

function providerTargetRejectionsEqual(
  left: CsharpProviderTargetRejection,
  right: CsharpProviderTargetRejection,
): boolean {
  return canonicalProviderValue(left) === canonicalProviderValue(right);
}

function canonicalRelationValue(
  relation: CsharpProviderTargetRelation,
): string {
  return canonicalProviderValue(relation);
}

function formatProviderSourceIdentity(identity: CsharpProviderSourceIdentity): string {
  const member = identity.kind === "member" || identity.kind === "signature"
    ? ` member '${identity.memberId ?? "<export>"}'`
    : "";
  const signature = identity.kind === "signature" ? ` signature '${identity.signatureId}'` : "";
  return `provider '${identity.providerId}' module '${identity.moduleSpecifier}' export '${identity.exportName}'${member}${signature}`;
}
