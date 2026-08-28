import type {
  ExtensionDiagnostic,
  ProviderMemberKey,
  ProviderVirtualDeclarationFact,
} from "@tsonic/tsts";
import type {
  CsharpProviderTargetRelation,
} from "../../relations/index.js";
import {
  providerMemberSourceIdentity,
  providerSignatureSourceIdentity,
  providerTypeSourceIdentity,
} from "../../relations/index.js";
import type {
  DotnetProviderTargetRelationTemplate,
} from "./target-relations.js";
import type {
  DotnetReflectionTypeDataProvider,
} from "../reflection/provider.js";

export type DotnetProviderTargetRelationResolution =
  | {
      readonly kind: "resolved";
      readonly relations: readonly CsharpProviderTargetRelation[];
    }
  | {
      readonly kind: "missing";
      readonly reason: string;
    }
  | {
      readonly kind: "rejected";
      readonly diagnostic: ExtensionDiagnostic;
    };

export function resolveDotnetProviderTargetRelations(
  provider: DotnetReflectionTypeDataProvider,
  declaration: ProviderVirtualDeclarationFact | undefined,
  requestedKind: CsharpProviderTargetRelation["kind"],
): DotnetProviderTargetRelationResolution {
  if (declaration === undefined) {
    return {
      kind: "missing",
      reason: "Selected source declaration has no provider identity fact.",
    };
  }
  if (
    declaration.providerId !== provider.identity.id ||
    declaration.providerVersion !== provider.identity.version
  ) {
    return {
      kind: "missing",
      reason:
        `Selected source declaration belongs to provider '${declaration.providerId}@${declaration.providerVersion}', not '${provider.identity.id}@${provider.identity.version}'.`,
    };
  }
  if (declaration.exportName === undefined || declaration.exportId === undefined) {
    return {
      kind: "missing",
      reason: "Selected provider declaration evidence is missing export id or export name.",
    };
  }
  const projected = provider.resolveTargetRelations({
    moduleSpecifier: declaration.moduleSpecifier,
    providerModuleId: declaration.providerModuleId,
    artifactFileName: declaration.artifactFileName,
    exportName: declaration.exportName,
    exportId: declaration.exportId,
  });
  if ("extensionId" in projected) {
    return { kind: "rejected", diagnostic: projected };
  }
  if (requestedKind === "signature") {
    return resolveSignatureRelations(declaration, projected);
  }
  if (requestedKind === "member") {
    return resolveMemberRelations(declaration, projected);
  }
  if (requestedKind === "type") {
    return resolveTypeRelations(declaration, projected);
  }
  return {
    kind: "resolved",
    relations: [],
  };
}

function resolveTypeRelations(
  declaration: ProviderVirtualDeclarationFact,
  templates: readonly DotnetProviderTargetRelationTemplate[],
): DotnetProviderTargetRelationResolution {
  const source = providerTypeSourceIdentity(declaration);
  if (source.kind === "missing") {
    return source;
  }
  return {
    kind: "resolved",
    relations: templates
      .filter((template): template is Extract<DotnetProviderTargetRelationTemplate, { kind: "type" }> =>
        template.kind === "type" &&
        template.exportId === source.identity.exportId)
      .map((template) => ({
        kind: "type",
        source: source.identity,
        targetBinding: template.targetBinding,
        bindingTypeParameters: template.bindingTypeParameters,
      })),
  };
}

function resolveMemberRelations(
  declaration: ProviderVirtualDeclarationFact,
  templates: readonly DotnetProviderTargetRelationTemplate[],
): DotnetProviderTargetRelationResolution {
  const source = providerMemberSourceIdentity(declaration);
  if (source.kind === "missing") {
    return source;
  }
  return {
    kind: "resolved",
    relations: templates
      .filter((template): template is Extract<DotnetProviderTargetRelationTemplate, { kind: "member" }> =>
        template.kind === "member" &&
        template.exportId === source.identity.exportId &&
        template.memberId === source.identity.memberId &&
        template.memberStatic === source.identity.memberStatic &&
        providerMemberKeysEqual(template.memberKey, source.identity.memberKey))
      .map((template) => ({
        kind: "member",
        source: source.identity,
        targetBinding: template.targetBinding,
        targetMember: template.targetMember,
        receiver: template.receiver,
        bindingTypeParameters: template.bindingTypeParameters,
        bindingTypeArgumentSource: template.bindingTypeArgumentSource,
      })),
  };
}

function resolveSignatureRelations(
  declaration: ProviderVirtualDeclarationFact,
  templates: readonly DotnetProviderTargetRelationTemplate[],
): DotnetProviderTargetRelationResolution {
  const source = providerSignatureSourceIdentity(declaration);
  if (source.kind === "missing") {
    return source;
  }
  return {
    kind: "resolved",
    relations: templates
      .filter((template): template is Extract<DotnetProviderTargetRelationTemplate, { kind: "signature" }> =>
        template.kind === "signature" &&
        template.exportId === source.identity.exportId &&
        template.memberId === source.identity.memberId &&
        template.memberStatic === source.identity.memberStatic &&
        optionalProviderMemberKeysEqual(template.memberKey, source.identity.memberKey) &&
        template.signatureId === source.identity.signatureId)
      .map((template) => ({
        kind: "signature",
        source: source.identity,
        targetBinding: template.targetBinding,
        targetMember: template.targetMember,
        receiver: template.receiver,
        parameters: template.parameters,
        bindingTypeParameters: template.bindingTypeParameters,
        bindingTypeArgumentSource: template.bindingTypeArgumentSource,
        methodTypeParameters: template.methodTypeParameters,
        invocationTypeParameters: template.invocationTypeParameters,
        selectedTypeParameterCount: template.selectedTypeParameterCount,
      })),
  };
}

function providerMemberKeysEqual(
  left: ProviderMemberKey,
  right: ProviderMemberKey | undefined,
): boolean {
  return right !== undefined &&
    left.kind === right.kind &&
    left.name === right.name;
}

function optionalProviderMemberKeysEqual(
  left: ProviderMemberKey | undefined,
  right: ProviderMemberKey | undefined,
): boolean {
  return left === undefined || right === undefined
    ? left === right
    : providerMemberKeysEqual(left, right);
}
