export type {
  DotnetAssemblyReference,
  DotnetConstraint,
  DotnetExportDeclaration,
  DotnetFunctionDeclaration,
  DotnetMemberDeclaration,
  DotnetMemberKind,
  DotnetModuleModel,
  DotnetNamespaceDeclaration,
  DotnetParameterDeclaration,
  DotnetProviderIdentity,
  DotnetSignatureDeclaration,
  DotnetTypeDeclaration,
  DotnetTypeKind,
  DotnetTypeParameterDeclaration,
  DotnetTypeRef,
  DotnetValueDeclaration,
} from "./model-types.js";
export {
  dotnetTypeParameterToProviderTypeParameter,
  dotnetTypeRefToProviderType,
} from "./model-provider-conversion.js";
export {
  dotnetConstraintToTargetConstraint,
  dotnetTypeRefToTargetTypeRef,
} from "./model-target-conversion.js";
