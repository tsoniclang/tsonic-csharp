import type {
  ProviderExportDeclaration,
  ProviderMemberDeclaration,
  ProviderParameterDeclaration,
  ProviderTypeExpression,
} from "@tsonic/tsts";
import type {
  NodejsUnsupportedTargetIdentity,
} from "../members/types.js";
import {
  nodeBufferExportName,
  nodeBufferModuleSpecifier,
} from "./identities.js";

export function nodeBufferUnsupportedTargetIdentities(): readonly NodejsUnsupportedTargetIdentity[] {
  return [
    ...nodeBufferUnsupportedFunctionDeclarations().map(({ exportName, signatureId, targetIdentityId, displayName }) => ({
      exportName,
      signatureId,
      targetIdentityId,
      displayName,
    })),
    ...nodeBufferUnsupportedClassMethodDeclarations().map(({ memberName, signatureId, targetIdentityId, displayName }) => ({
      exportName: nodeBufferExportName,
      memberName,
      signatureId,
      targetIdentityId,
      displayName,
    })),
    ...nodeBufferUnsupportedClassPropertyDeclarations().map(({ memberName, targetIdentityId, displayName }) => ({
      exportName: nodeBufferExportName,
      memberName,
      targetIdentityId,
      displayName,
    })),
  ];
}

export function nodeBufferUnsupportedFunctionExports(): readonly ProviderExportDeclaration[] {
  return nodeBufferUnsupportedFunctionDeclarations().map((declaration) => ({
    id: `${nodeBufferModuleSpecifier}.${declaration.exportName}`,
    name: declaration.exportName,
    kind: "function",
    signatures: [{
      id: declaration.signatureId,
      parameters: declaration.providerParameters,
      returnType: declaration.providerReturnType,
    }],
  }));
}

export function nodeBufferUnsupportedClassMemberDeclarations(): readonly ProviderMemberDeclaration[] {
  return [
    ...nodeBufferUnsupportedClassMethodDeclarations().map((declaration) => ({
      id: declaration.memberId,
      name: declaration.memberName,
      kind: "method" as const,
      static: true,
      signatures: [{
        id: declaration.signatureId,
        parameters: declaration.providerParameters,
        returnType: declaration.providerReturnType,
      }],
    })),
    ...nodeBufferUnsupportedClassPropertyDeclarations().map((declaration) => ({
      id: declaration.memberId,
      name: declaration.memberName,
      kind: "property" as const,
      static: true,
      type: declaration.providerType,
    })),
  ];
}

function nodeBufferUnsupportedFunctionDeclarations(): readonly NodeBufferUnsupportedFunctionDeclaration[] {
  return [];
}

function nodeBufferUnsupportedClassMethodDeclarations(): readonly NodeBufferUnsupportedClassMethodDeclaration[] {
  return [];
}

function nodeBufferUnsupportedClassPropertyDeclarations(): readonly NodeBufferUnsupportedClassPropertyDeclaration[] {
  return [];
}

interface NodeBufferUnsupportedFunctionDeclaration {
  readonly exportName: string;
  readonly signatureId: string;
  readonly targetIdentityId: string;
  readonly displayName: string;
  readonly providerParameters: readonly ProviderParameterDeclaration[];
  readonly providerReturnType: ProviderTypeExpression;
}

interface NodeBufferUnsupportedClassMethodDeclaration {
  readonly memberName: string;
  readonly memberId: string;
  readonly signatureId: string;
  readonly targetIdentityId: string;
  readonly displayName: string;
  readonly providerParameters: readonly ProviderParameterDeclaration[];
  readonly providerReturnType: ProviderTypeExpression;
}

interface NodeBufferUnsupportedClassPropertyDeclaration {
  readonly memberName: string;
  readonly memberId: string;
  readonly targetIdentityId: string;
  readonly displayName: string;
  readonly providerType: ProviderTypeExpression;
}
