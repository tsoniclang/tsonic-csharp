export type { DotnetAssemblyReference, DotnetAttributeArgument, DotnetAttributeDeclaration, DotnetAttributePlacement, DotnetAttributeValue, DotnetConstraint, DotnetConversionOperatorDeclaration, DotnetExportDeclaration, DotnetFunctionDeclaration, DotnetMemberDeclaration, DotnetMemberKind, DotnetModuleModel, DotnetNamespaceDeclaration, DotnetParameterDeclaration, DotnetParameterDefaultValue, DotnetProviderIdentity, DotnetSignatureDeclaration, DotnetTypeDeclaration, DotnetTypeKind, DotnetTypeParameterDeclaration, DotnetTypeRef, DotnetUnsupportedAttributeDeclaration, DotnetUnsupportedConstraintDeclaration, DotnetValueDeclaration, DotnetUnsupportedMemberDeclaration } from "./model/index.js";
export type { DotnetTargetMember, DotnetTargetParameter } from "./projection/index.js";
export { dotnetConstraintToTargetConstraint, dotnetTypeRefToTargetTypeRef } from "./projection/index.js";
export type { DotnetBindingProviderOptions } from "./projection/provider.js";
export type { DotnetProviderDeclarationContext, DotnetProviderDiagnostic, DotnetProviderModuleContext, DotnetProviderModuleResult, DotnetProviderOwnership, DotnetTypeDataProvider } from "./model/provider.js";
export { createDotnetSourceDeclarationProvider, createDotnetSourceDeclarationProviderSet } from "./projection/provider.js";
export { completeDotnetProviderContext, completeDotnetProviderMaterialization, emptyIncrementalDotnetProviderMaterialization } from "./model/provider.js";
export {
  validateDotnetModuleModelContract,
  validateDotnetProviderDeclarationModelContract,
} from "./model/normalization/index.js";
export type {
  DotnetReflectionTypeDataProvider,
  DotnetReflectionTypeDataProviderOptions,
  DotnetReflectionProviderStorage,
} from "./acquisition/provider.js";
export type {
  DotnetReflectionProviderBroker,
} from "./acquisition/broker.js";
export type {
  DotnetProviderModuleRequestTelemetry,
  DotnetProviderTelemetry,
  DotnetProviderTelemetrySnapshot,
} from "./acquisition/telemetry.js";
export {
  createDotnetReflectionTypeDataProvider,
} from "./acquisition/provider.js";
export {
  createDotnetReflectionProviderBroker,
} from "./acquisition/broker.js";
export {
  createDotnetProviderTelemetry,
  dotnetProviderTelemetryCounters,
  formatDotnetProviderTelemetrySnapshot,
} from "./acquisition/telemetry.js";
export {
  createDotnetModuleSpecifierPolicy,
  createDotnetModuleSpecifier,
  dotnetModuleExtension,
  dotnetModulePrefix,
  dotnetPackageName,
  dotnetModuleSpecifierPolicy,
  normalizeDotnetAssemblySourcePackages,
  parseDotnetModuleSpecifier,
} from "./projection/module-specifier.js";
export type {
  DotnetAssemblySourcePackage,
  DotnetModuleSpecifier,
  DotnetModuleSpecifierPolicy,
} from "./projection/module-specifier.js";
export {
  augmentDotnetModuleWithNativeArray,
  dotnetNativeArrayCreateMemberId,
  dotnetNativeArrayIndexerMemberId,
  dotnetNativeArrayLengthMemberId,
  dotnetNativeArrayTypeId,
} from "./projection/module-native-array.js";
export { dotnetModuleToProviderDeclarationModel } from "./projection/declarations/index.js";
export {
  csharpDotnetProviderContributionKind,
} from "./acquisition/contributions.js";
export type {
  CsharpDotnetProviderContribution,
} from "./acquisition/contributions.js";
