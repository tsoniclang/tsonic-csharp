import type {
  ProviderDeclarationModel,
  ProviderExportDeclaration,
  ProviderMemberDeclaration,
  ProviderMemberKey,
  ProviderPropertyName,
  ProviderSignatureDeclaration,
} from "@tsonic/tsts";
import type {
  CsharpProviderParameterRelation,
  CsharpProviderBindingTypeArgumentSource,
  CsharpTargetReceiverRelation,
  CsharpProviderTypeParameterRelation,
} from "../../relations/index.js";
import type {
  CsharpTargetBindingFact,
  CsharpTargetMember,
} from "../../../policy/types/index.js";
import type {
  DotnetTypeDeclaration,
} from "../model/index.js";
import {
  dotnetExportToTargetBinding,
} from "../model/index.js";
import {
  dotnetMemberToProviderMember,
} from "../declarations/members.js";
import {
  dotnetProviderSignatureIdsForMember,
} from "../declarations/signatures.js";
import {
  dotnetMemberToTargetMemberRecords,
} from "../target-projection/members.js";

export interface DotnetTargetMemberProjection {
  readonly targetBinding: CsharpTargetBindingFact;
  readonly targetMember: CsharpTargetMember;
  readonly sourceReceiverParameterIndex?: number;
}

export interface DotnetTargetFunctionProjection extends DotnetTargetMemberProjection {
  readonly bindingTypeParameters: readonly CsharpProviderTypeParameterRelation[];
  readonly methodTypeParameters: readonly CsharpProviderTypeParameterRelation[];
  readonly invocationTypeParameters: readonly CsharpProviderTypeParameterRelation[];
  readonly selectedTypeParameterCount: number;
}

export interface DotnetTargetRelationLookup {
  getTargetBinding(exportId: string): CsharpTargetBindingFact | undefined;
  getTargetMembersForProviderMember(memberId: string): readonly DotnetTargetMemberProjection[];
  getTargetMembersForProviderSignature(
    memberId: string,
    signatureId: string,
  ): readonly DotnetTargetMemberProjection[];
  getTargetFunctionsForProviderSignature(
    exportId: string,
    signatureId: string,
  ): readonly DotnetTargetFunctionProjection[];
}

export type DotnetProviderTargetRelationTemplate =
  | {
      readonly kind: "type";
      readonly exportId: string;
      readonly targetBinding: CsharpTargetBindingFact;
      readonly bindingTypeParameters: readonly CsharpProviderTypeParameterRelation[];
    }
  | {
      readonly kind: "member";
      readonly exportId: string;
      readonly memberId?: string;
      readonly memberStatic?: boolean;
      readonly memberKey?: ProviderMemberKey;
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
      readonly exportId: string;
      readonly memberId?: string;
      readonly memberStatic?: boolean;
      readonly memberKey?: ProviderMemberKey;
      readonly signatureId: string;
      readonly targetBinding: CsharpTargetBindingFact;
      readonly targetMember: CsharpTargetMember;
      readonly receiver: CsharpTargetReceiverRelation;
      readonly parameters: readonly CsharpProviderParameterRelation[];
      readonly bindingTypeParameters: readonly CsharpProviderTypeParameterRelation[];
      readonly bindingTypeArgumentSource: CsharpProviderBindingTypeArgumentSource;
      readonly methodTypeParameters: readonly CsharpProviderTypeParameterRelation[];
      readonly invocationTypeParameters: readonly CsharpProviderTypeParameterRelation[];
      readonly selectedTypeParameterCount: number;
    };

export function dotnetProviderTargetRelationTemplates(
  model: ProviderDeclarationModel,
  lookup: DotnetTargetRelationLookup,
): readonly DotnetProviderTargetRelationTemplate[] {
  return Object.freeze(model.exports.flatMap((declaration) =>
    dotnetProviderExportTargetRelationTemplates(declaration, lookup)));
}

export function dotnetTypeTargetMemberProjections(
  declaration: DotnetTypeDeclaration,
): {
  readonly memberProjections: ReadonlyMap<string, readonly DotnetTargetMemberProjection[]>;
  readonly signatureProjections: ReadonlyMap<string, readonly DotnetTargetMemberProjection[]>;
  readonly canonicalSignatureProjections: ReadonlyMap<string, readonly DotnetTargetMemberProjection[]>;
} {
  const targetBinding = dotnetExportToTargetBinding(declaration) as CsharpTargetBindingFact;
  const memberProjections = new Map<string, DotnetTargetMemberProjection[]>();
  const signatureProjections = new Map<string, DotnetTargetMemberProjection[]>();
  const canonicalSignatureProjections = new Map<
    string,
    DotnetTargetMemberProjection[]
  >();
  for (const member of declaration.members ?? []) {
    const providerMember = dotnetMemberToProviderMember(member, declaration);
    if (providerMember === undefined) {
      continue;
    }
    const targetMemberRecords = dotnetMemberToTargetMemberRecords(
      member,
      targetBinding.csharpType ?? {
        kind: "target-named",
        id: targetBinding.id,
      },
    );
    if (providerMember.signatures === undefined) {
      const record = targetMemberRecords[0];
      if (
        targetMemberRecords.length !== 1 ||
        record === undefined ||
        record.kind !== "member"
      ) {
        throw new Error(
          `.NET provider member '${providerMember.id}' did not produce exactly one target member.`,
        );
      }
      appendProjection(memberProjections, providerMember.id, {
        targetBinding,
        targetMember: record.targetMember,
        ...(member.sourceReceiverParameterIndex === undefined
          ? {}
          : { sourceReceiverParameterIndex: member.sourceReceiverParameterIndex }),
      });
      continue;
    }
    const providerSignatureIds = dotnetProviderSignatureIdsForMember(
      member,
      providerMember.id,
      member.kind === "constructor" ? undefined : member.targetName,
      {
        sourceReceiverParameterIndex: member.sourceReceiverParameterIndex,
        parentTypeParameterNames:
          declaration.typeParameters?.map((parameter) => parameter.name) ?? [],
      },
    );
    const signaturesByTargetId = new Map(
      (member.signatures ?? []).map((signature) => [signature.id, signature]),
    );
    for (const record of targetMemberRecords) {
      if (record.kind !== "signature") {
        throw new Error(
          `.NET provider member '${providerMember.id}' produced a non-signature target record for a callable declaration.`,
        );
      }
      const signatureId = providerSignatureIds.get(record.sourceSignatureId);
      if (signatureId === undefined) {
        continue;
      }
      const projection = {
        targetBinding,
        targetMember: record.targetMember,
        ...(member.sourceReceiverParameterIndex === undefined
          ? {}
          : { sourceReceiverParameterIndex: member.sourceReceiverParameterIndex }),
      };
      appendProjection(
        signatureProjections,
        providerSignatureProjectionKey(providerMember.id, signatureId),
        projection,
      );
      const sourceSignature = signaturesByTargetId.get(
        record.sourceSignatureId,
      );
      if (
        sourceSignature !== undefined &&
        sourceSignature.id === sourceSignature.sourceId
      ) {
        appendProjection(
          canonicalSignatureProjections,
          signatureId,
          projection,
        );
      }
    }
  }
  return {
    memberProjections: freezeProjectionMap(memberProjections),
    signatureProjections: freezeProjectionMap(signatureProjections),
    canonicalSignatureProjections: freezeProjectionMap(
      canonicalSignatureProjections,
    ),
  };
}

function dotnetProviderExportTargetRelationTemplates(
  declaration: ProviderExportDeclaration,
  lookup: DotnetTargetRelationLookup,
): readonly DotnetProviderTargetRelationTemplate[] {
  if (declaration.kind === "function") {
    return (declaration.signatures ?? []).flatMap((signature) =>
      lookup.getTargetFunctionsForProviderSignature(
        declaration.id,
        signature.id,
      ).map((projection) => ({
        kind: "signature" as const,
        exportId: declaration.id,
        signatureId: signature.id,
        targetBinding: projection.targetBinding,
        targetMember: projection.targetMember,
        receiver: { kind: "none" as const },
        parameters: providerParameterRelations(signature.parameters, projection),
        bindingTypeParameters: projection.bindingTypeParameters,
        bindingTypeArgumentSource: "selected-operation-type-arguments" as const,
        methodTypeParameters: projection.methodTypeParameters,
        invocationTypeParameters: projection.invocationTypeParameters,
        selectedTypeParameterCount: projection.selectedTypeParameterCount,
      })));
  }
  const targetBinding = lookup.getTargetBinding(declaration.id);
  if (targetBinding === undefined) {
    return [];
  }
  const bindingTypeParameters = providerTypeParameterRelations(
    declaration.typeParameters?.length ?? 0,
    targetBinding.typeParameters?.length ?? 0,
    `export '${declaration.id}'`,
  );
  const relations: DotnetProviderTargetRelationTemplate[] = [{
    kind: "type",
    exportId: declaration.id,
    targetBinding,
    bindingTypeParameters,
  }];
  for (const member of declaration.members ?? []) {
    relations.push(...dotnetProviderMemberTargetRelationTemplates(
      declaration,
      member,
      lookup,
      bindingTypeParameters,
    ));
  }
  return relations;
}

function dotnetProviderMemberTargetRelationTemplates(
  declaration: ProviderExportDeclaration,
  member: ProviderMemberDeclaration,
  lookup: DotnetTargetRelationLookup,
  bindingTypeParameters: readonly CsharpProviderTypeParameterRelation[],
): readonly DotnetProviderTargetRelationTemplate[] {
  const memberKey = providerMemberKey(member.name);
  if (member.signatures === undefined) {
    return lookup.getTargetMembersForProviderMember(member.id).map((projection) => ({
      kind: "member",
      exportId: declaration.id,
      memberId: member.id,
      memberStatic: member.static === true,
      memberKey,
      targetBinding: projection.targetBinding,
      targetMember: projection.targetMember,
      receiver: providerReceiverRelation(projection),
      bindingTypeParameters,
      bindingTypeArgumentSource: providerBindingTypeArgumentSource(
        projection.targetMember,
      ),
    }));
  }
  return member.signatures.flatMap((signature) =>
    lookup.getTargetMembersForProviderSignature(
      member.id,
      signature.id,
    ).map((projection) => {
      const parameters = providerParameterRelations(
        signature.parameters,
        projection,
      );
      const selectedTypeArgumentsCloseBinding =
        projection.targetMember.kind === "constructor" ||
        projection.targetMember.csharpInvocation?.kind === "array-creation";
      const relationBindingTypeParameters =
        projection.targetMember.csharpInvocation?.kind === "array-creation"
          ? providerTypeParameterRelations(
              signature.typeParameters?.length ?? 0,
              projection.targetBinding.typeParameters?.length ?? 0,
              `array-creation signature '${signature.id}'`,
            )
          : bindingTypeParameters;
      const methodTypeParameters = selectedTypeArgumentsCloseBinding
        ? []
        : providerTypeParameterRelations(
            signature.typeParameters?.length ?? 0,
            projection.targetMember.typeParameters?.length ?? 0,
            `signature '${signature.id}'`,
          );
      return {
        kind: "signature" as const,
        exportId: declaration.id,
        memberId: member.id,
        memberStatic: member.static === true,
        memberKey,
        signatureId: signature.id,
        targetBinding: projection.targetBinding,
        targetMember: projection.targetMember,
        receiver: providerReceiverRelation(projection),
        parameters,
        bindingTypeParameters: relationBindingTypeParameters,
        bindingTypeArgumentSource:
          selectedTypeArgumentsCloseBinding
            ? "selected-operation-type-arguments"
            : providerBindingTypeArgumentSource(projection.targetMember),
        methodTypeParameters,
        invocationTypeParameters: [],
        selectedTypeParameterCount: signature.typeParameters?.length ?? 0,
      };
    }));
}

export function providerSignatureProjectionKey(
  memberId: string,
  signatureId: string,
): string {
  return JSON.stringify([memberId, signatureId]);
}

function providerBindingTypeArgumentSource(
  member: CsharpTargetMember,
): Exclude<
  CsharpProviderBindingTypeArgumentSource,
  "selected-operation-type-arguments"
> {
  return member.static === true ? "callee" : "receiver";
}

function providerTypeParameterRelations(
  sourceTypeParameterCount: number,
  targetTypeParameterCount: number,
  context: string,
): readonly CsharpProviderTypeParameterRelation[] {
  if (sourceTypeParameterCount !== targetTypeParameterCount) {
    throw new Error(
      `.NET provider ${context} exposes ${sourceTypeParameterCount} source type parameters but relates to ${targetTypeParameterCount} target type parameters.`,
    );
  }
  return Object.freeze(
    Array.from(
      { length: sourceTypeParameterCount },
      (_, sourceTypeParameterIndex) => ({
        sourceTypeParameterIndex,
        targetTypeParameterIndex: sourceTypeParameterIndex,
      }),
    ),
  );
}

function providerReceiverRelation(
  projection: DotnetTargetMemberProjection,
): CsharpTargetReceiverRelation {
  if (projection.sourceReceiverParameterIndex !== undefined) {
    if (
      projection.targetMember.receiverPassing !== "target-parameter" ||
      projection.sourceReceiverParameterIndex < 0 ||
      projection.sourceReceiverParameterIndex >= projection.targetMember.parameters.length
    ) {
      throw new Error(
        `.NET provider target member '${projection.targetMember.id}' has an invalid exact receiver-parameter projection.`,
      );
    }
    return {
      kind: "target-parameter",
      targetParameterIndex: projection.sourceReceiverParameterIndex,
    };
  }
  return projection.targetMember.static === true ||
      projection.targetMember.kind === "constructor"
    ? { kind: "none" }
    : { kind: "instance" };
}

function providerParameterRelations(
  sourceParameters: ProviderSignatureDeclaration["parameters"],
  projection: DotnetTargetMemberProjection,
): readonly CsharpProviderParameterRelation[] {
  const sourceParameterCount = sourceParameters.length;
  const targetParameterCount = projection.targetMember.parameters.length;
  const receiverIndex = projection.sourceReceiverParameterIndex;
  if (sourceParameterCount + (receiverIndex === undefined ? 0 : 1) !== targetParameterCount) {
    throw new Error(
      `.NET provider signature '${projection.targetMember.id}' does not relate its exact source parameters and optional receiver to every target parameter.`,
    );
  }
  const targetIndexes = Array.from(
    { length: targetParameterCount },
    (_, index) => index,
  ).filter((index) => index !== receiverIndex);
  return Object.freeze(
    Array.from({ length: sourceParameterCount }, (_, sourceParameterIndex) => {
      const sourceParameter = sourceParameters[sourceParameterIndex]!;
      const targetParameterIndex = targetIndexes[sourceParameterIndex]!;
      const targetParameter =
        projection.targetMember.parameters[targetParameterIndex]!;
      return {
        sourceParameterIndex,
        targetParameterIndex,
        sourcePassingMode: sourceParameter.passingMode ?? "by-value",
        targetPassingMode: targetParameter.passingMode,
        sourceAcceptsOmission:
          sourceParameter.optional === true ||
          sourceParameter.defaultType !== undefined ||
          sourceParameter.rest === true,
        targetAcceptsOmission:
          targetParameter.optional === true ||
          targetParameter.csharpOmittableOptionalArgument === true ||
          targetParameter.paramsArray === true,
        sourceRest: sourceParameter.rest === true,
        targetParamsArray: targetParameter.paramsArray === true,
      };
    }),
  );
}

function appendProjection(
  projections: Map<string, DotnetTargetMemberProjection[]>,
  id: string,
  projection: DotnetTargetMemberProjection,
): void {
  const existing = projections.get(id) ?? [];
  if (!existing.some((candidate) =>
    candidate.targetBinding.id === projection.targetBinding.id &&
    candidate.targetMember.id === projection.targetMember.id)) {
    existing.push(projection);
    projections.set(id, existing);
  }
}

function freezeProjectionMap(
  projections: Map<string, DotnetTargetMemberProjection[]>,
): ReadonlyMap<string, readonly DotnetTargetMemberProjection[]> {
  return new Map(
    [...projections].map(([id, candidates]) => [id, Object.freeze(candidates)]),
  );
}

function providerMemberKey(name: ProviderPropertyName): ProviderMemberKey {
  if (typeof name === "string") {
    return { kind: "property-key", name };
  }
  switch (name.kind) {
    case "identifier":
    case "string-literal":
      return { kind: "property-key", name: name.text };
    case "number-literal":
      return { kind: "property-key", name: String(name.value) };
    case "well-known-symbol":
      return name;
  }
}
