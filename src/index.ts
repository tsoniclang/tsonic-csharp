import { createCsharpTargetPack, csharpTargetId } from "./descriptor/csharp-target-pack.js";

export { createCsharpTargetPack, csharpTargetId } from "./descriptor/csharp-target-pack.js";
export {
  csharpLangModule,
  csharpTypesModule,
  createCsharpSourceSemanticsExtension,
} from "./source/csharp-source-semantics.js";
export {
  csharpProviderDiagnostic,
} from "./source/csharp-source-semantics/diagnostics.js";
export {
  csharpProviderVersion,
  csharpSourceSemanticsExtensionId,
} from "./source/csharp-source-semantics/identity.js";
export * from "./policy/types/index.js";
export * from "./provider/contributions.js";
export * from "./provider/target-relations/index.js";
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
  createDotnetSourceDeclarationProvider,
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
