import type {
  ProviderParameterDeclaration,
  ProviderSignatureDeclaration,
} from "@tsonic/tsts";
import type { DotnetSignatureDeclaration } from "../model.js";
import {
  dotnetTypeParameterToProviderTypeParameter,
  tryDotnetTypeRefToProviderType,
} from "../model.js";
import { dotnetParameterToProviderParameter } from "./parameters.js";

export function dotnetSignatureToProviderSignature(
  signature: DotnetSignatureDeclaration,
  memberTargetName?: string,
): ProviderSignatureDeclaration | undefined {
  const parameters = signature.parameters.map(dotnetParameterToProviderParameter);
  const returnType = signature.returnType === undefined ? undefined : tryDotnetTypeRefToProviderType(signature.returnType);
  if (parameters.some((parameter) => parameter === undefined) || (signature.returnType !== undefined && returnType === undefined)) {
    return undefined;
  }
  return {
    id: signature.id,
    ...(signature.targetName !== undefined || memberTargetName !== undefined ? { name: signature.targetName ?? memberTargetName } : {}),
    parameters: parameters as ProviderParameterDeclaration[],
    ...(returnType !== undefined ? { returnType } : {}),
    ...(signature.typeParameters !== undefined ? { typeParameters: signature.typeParameters.map(dotnetTypeParameterToProviderTypeParameter) } : {}),
  };
}

export function mergeProviderSignatures(signatures: readonly ProviderSignatureDeclaration[]): readonly ProviderSignatureDeclaration[] {
  const byId = new Map<string, ProviderSignatureDeclaration>();
  for (const signature of signatures) {
    byId.set(providerSignatureShapeKey(signature), signature);
  }
  return [...byId.values()];
}

function providerSignatureShapeKey(signature: ProviderSignatureDeclaration): string {
  return JSON.stringify({
    typeParameters: signature.typeParameters,
    parameters: signature.parameters,
    returnType: signature.returnType,
  });
}
