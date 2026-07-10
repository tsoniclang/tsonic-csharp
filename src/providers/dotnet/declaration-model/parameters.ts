import type { ProviderParameterDeclaration } from "@tsonic/tsts";
import type { DotnetParameterDeclaration } from "../model.js";
import { tryDotnetTypeRefToProviderType } from "../model.js";

export function dotnetParameterToProviderParameter(parameter: DotnetParameterDeclaration): ProviderParameterDeclaration | undefined {
  const type = tryDotnetTypeRefToProviderType(parameter.sourceType ?? parameter.type);
  if (type === undefined) {
    return undefined;
  }
  return {
    name: parameter.name,
    type,
    ...(parameter.passingMode !== "by-value" ? { passingMode: parameter.passingMode } : {}),
    ...(parameter.optional === true ? { optional: true } : {}),
    ...(parameter.rest === true ? { rest: true } : {}),
  };
}
