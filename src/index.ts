import { createCsharpTargetPack, csharpTargetId } from "./descriptor/csharp-target-pack.js";

export { createCsharpTargetPack, csharpTargetId } from "./descriptor/csharp-target-pack.js";
export {
  csharpLangModule,
  csharpTypesModule,
  createCsharpTargetSemanticsExtension,
  createCsharpSourceSemanticsExtension,
  createCsharpJsSurfaceExtension,
} from "./source/csharp-source-semantics.js";
export {
  csharpProviderDiagnostic,
} from "./source/csharp-source-semantics/diagnostics.js";
export {
  csharpProviderVersion,
  csharpSourceSemanticsExtensionId,
  csharpTargetSemanticsExtensionId,
  csharpJsSurfaceExtensionId,
} from "./source/csharp-source-semantics/identity.js";
export {
  recordCsharpTargetOperation,
} from "./source/csharp-source-semantics/operations.js";
export {
  csharpCheckedCallMappingResultForMember,
} from "./source/csharp-source-semantics/target-selection-contract.js";
export {
  getCsharpCheckedCallRequestContext,
} from "./source/csharp-source-semantics/checked-call-request-context.js";
export {
  getCsharpCheckedElementAccessRequestContext,
  getCsharpCheckedPropertyAccessRequestContext,
} from "./source/csharp-source-semantics/checked-member-access-request-context.js";
export * from "./source/csharp-facts.js";
export * from "./source/csharp-source-semantics/target-types.js";
export * from "./source/csharp-source-semantics/surfaces/js/source-library.js";
export * from "./source/csharp-source-semantics/surfaces/js/date/index.js";
export {
  csharpDotnetProviderContributionKind,
  csharpProviderOperationsContributionKind,
  csharpTargetBindingsContributionKind,
} from "./source/csharp-source-semantics/provider-packages/index.js";
export type {
  CsharpDotnetProviderContribution,
  CsharpCapabilityTargetBinding,
  CsharpProviderOperationsContribution,
  CsharpTargetBindingsContribution,
} from "./source/csharp-source-semantics/provider-packages/index.js";
export type {
  CsharpArgument,
  CsharpBlock,
  CsharpClassDeclaration,
  CsharpCompilationUnit,
  CsharpExpression,
  CsharpFieldDeclaration,
  CsharpInterfaceDeclaration,
  CsharpInterfaceIndexerDeclaration,
  CsharpInterfaceMember,
  CsharpInterfaceMethodDeclaration,
  CsharpInterfacePropertyDeclaration,
  CsharpMember,
  CsharpMethodDeclaration,
  CsharpModifier,
  CsharpNamespace,
  CsharpParameter,
  CsharpPropertyDeclaration,
  CsharpStatement,
  CsharpStructDeclaration,
  CsharpTypeDeclaration,
  CsharpTypeMember,
  CsharpTypeNode,
  CsharpUsing,
} from "./backend/roslyn/syntax.js";
export { printCsharpCompilationUnit, printCsharpExpression, printCsharpStatement, printCsharpType } from "./print/csharp-printer.js";
export type {
  DotnetAssemblyReference,
  DotnetAttributeArgument,
  DotnetAttributeDeclaration,
  DotnetAttributePlacement,
  DotnetAttributeValue,
  DotnetBindingProviderOptions,
  DotnetConstraint,
  DotnetConversionOperatorDeclaration,
  DotnetExportDeclaration,
  DotnetAssemblySourcePackage,
  DotnetFunctionDeclaration,
  DotnetMemberDeclaration,
  DotnetMemberKind,
  DotnetModuleModel,
  DotnetModuleSpecifier,
  DotnetModuleSpecifierPolicy,
  DotnetNamespaceDeclaration,
  DotnetParameterDeclaration,
  DotnetParameterDefaultValue,
  DotnetProviderDiagnostic,
  DotnetProviderIdentity,
  DotnetProviderModuleRequestTelemetry,
  DotnetProviderModuleContext,
  DotnetProviderModuleResult,
  DotnetProviderOwnership,
  DotnetProviderTelemetry,
  DotnetProviderTelemetrySnapshot,
  DotnetReflectionTypeDataProvider,
  DotnetReflectionTypeDataProviderOptions,
  DotnetSignatureDeclaration,
  DotnetTargetMember,
  DotnetTargetParameter,
  DotnetTypeDataProvider,
  DotnetTypeDeclaration,
  DotnetTypeKind,
  DotnetTypeParameterDeclaration,
  DotnetTypeRef,
  DotnetUnsupportedAttributeDeclaration,
  DotnetValueDeclaration,
} from "./providers/dotnet/index.js";
export {
  createDotnetModuleSpecifierPolicy,
  createDotnetModuleSpecifier,
  createDotnetProviderTelemetry,
  createDotnetReflectionTypeDataProvider,
  createDotnetTargetBindingProvider,
  dotnetConstraintToTargetConstraint,
  augmentDotnetModuleWithNativeArray,
  dotnetModuleExtension,
  dotnetModulePrefix,
  dotnetModuleToProviderDeclarationModel,
  dotnetNativeArrayCreateMemberId,
  dotnetNativeArrayIndexerMemberId,
  dotnetNativeArrayLengthMemberId,
  dotnetNativeArrayTypeId,
  dotnetPackageName,
  dotnetModuleSpecifierPolicy,
  dotnetTypeRefToProviderType,
  dotnetTypeRefToTargetTypeRef,
  isDotnetNativeArrayCreateMemberId,
  normalizeDotnetAssemblySourcePackages,
  parseDotnetModuleSpecifier,
  validateDotnetModuleModelContract,
  validateDotnetProviderDeclarationModelContract,
} from "./providers/dotnet/index.js";

export function createTsonicPlugin() {
  return {
    kind: "target" as const,
    id: "@tsonic/target-csharp",
    targetId: csharpTargetId,
    createTargetPack: createCsharpTargetPack,
  };
}
