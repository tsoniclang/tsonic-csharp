export type {
  DotnetAssemblyReference,
  DotnetAttributeArgument,
  DotnetAttributeDeclaration,
  DotnetAttributePlacement,
  DotnetAttributeValue,
  DotnetConstraint,
  DotnetConversionOperatorDeclaration,
  DotnetExportDeclaration,
  DotnetFunctionDeclaration,
  DotnetMemberDeclaration,
  DotnetMemberKind,
  DotnetModuleModel,
  DotnetNamespaceDeclaration,
  DotnetParameterDeclaration,
  DotnetParameterDefaultValue,
  DotnetProviderIdentity,
  DotnetSignatureDeclaration,
  DotnetTargetMember,
  DotnetTargetParameter,
  DotnetTypeDeclaration,
  DotnetTypeKind,
  DotnetTypeParameterDeclaration,
  DotnetTypeRef,
  DotnetUnsupportedAttributeDeclaration,
  DotnetUnsupportedConstraintDeclaration,
  DotnetValueDeclaration,
  DotnetUnsupportedMemberDeclaration,
} from "./model/index.js";
export {
  dotnetConstraintToTargetConstraint,
  dotnetTypeRefToProviderType,
  dotnetTypeRefToTargetTypeRef,
} from "./model/index.js";
export type {
  DotnetBindingProviderOptions,
  DotnetProviderDeclarationContext,
  DotnetProviderDiagnostic,
  DotnetProviderModuleContext,
  DotnetProviderModuleResult,
  DotnetProviderOwnership,
  DotnetTypeDataProvider,
} from "./provider.js";
export {
  completeDotnetProviderContext,
  completeDotnetProviderMaterialization,
  createDotnetSourceDeclarationProvider,
  createDotnetSourceDeclarationProviderSet,
  emptyIncrementalDotnetProviderMaterialization,
} from "./provider.js";
export {
  validateDotnetModuleModelContract,
  validateDotnetProviderDeclarationModelContract,
} from "./model/contract.js";
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
} from "./projection/modules/specifier.js";
export type {
  DotnetAssemblySourcePackage,
  DotnetModuleSpecifier,
  DotnetModuleSpecifierPolicy,
} from "./projection/modules/specifier.js";
export {
  augmentDotnetModuleWithNativeArray,
  dotnetNativeArrayCreateMemberId,
  dotnetNativeArrayIndexerMemberId,
  dotnetNativeArrayLengthMemberId,
  dotnetNativeArrayTypeId,
} from "./projection/modules/native-array.js";
export { dotnetModuleToProviderDeclarationModel } from "./projection/declarations/index.js";
export {
  csharpDotnetProviderContributionKind,
} from "./contributions.js";
export type {
  CsharpDotnetProviderContribution,
} from "./contributions.js";
