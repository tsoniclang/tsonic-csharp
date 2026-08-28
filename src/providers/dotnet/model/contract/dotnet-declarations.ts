import { dotnetConversionOperatorNameMatchesKind, validateDotnetTargetIdentity, validateOptionalDotnetAssemblyReference, validateOptionalDotnetRenderShape } from "./dotnet-identities.js";
import { requireNonEmptyString, requireSupportedDiscriminant, requireUnique, supportedDotnetConversionKinds, supportedDotnetConversionOperatorNames, supportedDotnetExportKinds, supportedDotnetMemberKinds, supportedDotnetTypeKinds, supportedReturnPassingModes } from "./support.js";
import { validateDotnetConstraints, validateDotnetSignatureList, validateDotnetTypeParameters, validateUnsupportedConstraints, validateUnsupportedMembers } from "./dotnet-signatures.js";
import { validateDotnetTypeRef, validateOptionalDotnetTypeRef } from "./dotnet-types.js";
import type {
  DotnetExportDeclaration,
  DotnetMemberDeclaration,
  DotnetTypeDeclaration,
} from "../index.js";
import type { ContractCollector } from "./support.js";

export function validateExportList(
  declarations: readonly DotnetExportDeclaration[],
  path: string,
  collector: ContractCollector,
  options: { readonly sourceVisible: boolean },
): void {
  const sourceNames = new Set<string>();
  const targetIds = new Set<string>();
  for (const [index, declaration] of declarations.entries()) {
    const declarationPath = `${path}[${index}]`;
    validateDotnetExportDeclaration(declaration, declarationPath, collector, options);
    if (options.sourceVisible && "sourceName" in declaration) {
      requireUnique(sourceNames, declaration.sourceName, `${declarationPath}.sourceName`, collector);
    }
    if ("targetId" in declaration) {
      requireUnique(targetIds, declaration.targetId, `${declarationPath}.targetId`, collector);
    }
  }
}
function validateDotnetExportDeclaration(
  declaration: DotnetExportDeclaration,
  path: string,
  collector: ContractCollector,
  options: { readonly sourceVisible: boolean },
): void {
  if (!requireSupportedDiscriminant(
    (declaration as unknown as Readonly<Record<string, unknown>>).kind,
    `${path}.kind`,
    collector,
    ".NET export declaration kind",
    supportedDotnetExportKinds,
  )) {
    return;
  }
  switch (declaration.kind) {
    case "type":
      validateDotnetTypeDeclaration(declaration, path, collector, options);
      return;
    case "function":
      requireNonEmptyString(declaration.sourceName, `${path}.sourceName`, collector);
      validateDotnetTargetIdentity(declaration.targetId, declaration.metadataName, `${path}.targetId`, `${path}.metadataName`, collector);
      requireNonEmptyString(declaration.targetName, `${path}.targetName`, collector);
      requireNonEmptyString(declaration.targetBindingId, `${path}.targetBindingId`, collector);
      validateDotnetTypeRef(declaration.targetDeclaringType, `${path}.targetDeclaringType`, collector, {
        allowLiteral: false,
        allowProviderRef: false,
        targetPosition: true,
      });
      validateDotnetSignatureList(declaration.signatures, `${path}.signatures`, collector, { requireReturnType: true });
      return;
    case "value":
      requireNonEmptyString(declaration.sourceName, `${path}.sourceName`, collector);
      validateDotnetTargetIdentity(declaration.targetId, declaration.metadataName, `${path}.targetId`, `${path}.metadataName`, collector);
      validateDotnetTypeRef(declaration.type, `${path}.type`, collector, { allowLiteral: false, allowProviderRef: false, targetPosition: true });
      return;
    case "namespace":
      requireNonEmptyString(declaration.sourceName, `${path}.sourceName`, collector);
      requireNonEmptyString(declaration.namespaceName, `${path}.namespaceName`, collector);
      validateExportList(declaration.exports, `${path}.exports`, collector, options);
      return;
  }
}
function validateDotnetTypeDeclaration(
  declaration: DotnetTypeDeclaration,
  path: string,
  collector: ContractCollector,
  options: { readonly sourceVisible: boolean },
): void {
  const typeKindValid = requireSupportedDiscriminant(
    (declaration as unknown as Readonly<Record<string, unknown>>).typeKind,
    `${path}.typeKind`,
    collector,
    ".NET type declaration kind",
    supportedDotnetTypeKinds,
  );
  requireNonEmptyString(declaration.sourceName, `${path}.sourceName`, collector);
  validateOptionalDotnetSourceTypeFamily(declaration.sourceTypeFamily, declaration.typeParameters?.length ?? 0, `${path}.sourceTypeFamily`, collector);
  requireNonEmptyString(declaration.namespaceName, `${path}.namespaceName`, collector);
  validateDotnetTargetIdentity(declaration.targetId, declaration.metadataName, `${path}.targetId`, `${path}.metadataName`, collector, {
    assembly: declaration.assembly,
  });
  validateOptionalDotnetAssemblyReference(declaration.assembly, `${path}.assembly`, collector);
  validateOptionalDotnetRenderShape(declaration.renderShape, `${path}.renderShape`, collector);
  validateDotnetTypeParameters(declaration.typeParameters ?? [], `${path}.typeParameters`, collector);
  if (declaration.abstract !== undefined && declaration.abstract !== true) {
    collector.add(`${path}.abstract`, "A .NET abstract-type fact, when present, must be true.", declaration.abstract);
  }
  if (declaration.abstract === true && declaration.typeKind !== "class") {
    collector.add(`${path}.abstract`, "Only CLR class declarations may carry the abstract-type fact.", declaration.abstract);
  }
  if (declaration.unmanagedTypeParameterIndexes !== undefined) {
    const indexes = declaration.unmanagedTypeParameterIndexes;
    if (
      declaration.typeKind !== "struct" && declaration.typeKind !== "enum" ||
      new Set(indexes).size !== indexes.length ||
      indexes.some((index) =>
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= (declaration.typeParameters?.length ?? 0)
      )
    ) {
      collector.add(
        `${path}.unmanagedTypeParameterIndexes`,
        "An unmanaged CLR type fact must identify a unique subset of its own generic parameters on a struct or enum.",
        indexes,
      );
    }
  }
  validateOptionalDotnetTypeRef(declaration.baseType, `${path}.baseType`, collector, { allowLiteral: false, allowProviderRef: true, targetPosition: true });
  validateDotnetConstraints(declaration.implementedContracts ?? [], `${path}.implementedContracts`, collector);
  validateUnsupportedConstraints(declaration.unsupportedImplementedContracts ?? [], `${path}.unsupportedImplementedContracts`, collector);
  const unsupportedMembers = declaration.unsupportedMembers ?? [];
  validateDotnetMemberList(declaration.members ?? [], `${path}.members`, collector, {
    sourceVisible: options.sourceVisible,
  });
  validateUnsupportedMembers(unsupportedMembers, `${path}.unsupportedMembers`, collector);
  for (const [index, operator] of (declaration.conversionOperators ?? []).entries()) {
    const operatorPath = `${path}.conversionOperators[${index}]`;
    const targetNameValid = requireSupportedDiscriminant(
      (operator as unknown as Readonly<Record<string, unknown>>).targetName,
      `${operatorPath}.targetName`,
      collector,
      ".NET conversion operator target name",
      supportedDotnetConversionOperatorNames,
    );
    const conversionKindValid = requireSupportedDiscriminant(
      (operator as unknown as Readonly<Record<string, unknown>>).conversionKind,
      `${operatorPath}.conversionKind`,
      collector,
      ".NET conversion operator kind",
      supportedDotnetConversionKinds,
    );
    if (targetNameValid && conversionKindValid && !dotnetConversionOperatorNameMatchesKind(operator.targetName, operator.conversionKind)) {
      collector.add(`${operatorPath}.conversionKind`, ".NET conversion operator targetName and conversionKind must describe the same CLR operator.", operator.conversionKind);
    }
    validateDotnetTargetIdentity(operator.id, operator.metadataName, `${operatorPath}.id`, `${operatorPath}.metadataName`, collector);
    validateDotnetTypeRef(operator.sourceType, `${operatorPath}.sourceType`, collector, { allowLiteral: false, allowProviderRef: false, targetPosition: true });
    validateDotnetTypeRef(operator.targetType, `${operatorPath}.targetType`, collector, { allowLiteral: false, allowProviderRef: false, targetPosition: true });
  }
  validateOptionalDotnetTypeRef(declaration.sourceShape, `${path}.sourceShape`, collector, { allowLiteral: true, allowProviderRef: true });
  validateOptionalDotnetTypeRef(declaration.targetType, `${path}.targetType`, collector, { allowLiteral: false, allowProviderRef: false, targetPosition: true });
  if (options.sourceVisible && typeKindValid && declaration.typeKind === "delegate" && declaration.sourceShape === undefined) {
    collector.add(`${path}.sourceShape`, "Source-visible delegate declarations must carry a source function shape or be moved to targetOnlyTypes/unsupportedExports.");
  }
}

function validateOptionalDotnetSourceTypeFamily(
  family: DotnetTypeDeclaration["sourceTypeFamily"] | undefined,
  typeParameterCount: number,
  path: string,
  collector: ContractCollector,
): void {
  if (family === undefined) {
    return;
  }
  requireNonEmptyString(family.exportName, `${path}.exportName`, collector);
  if (!Number.isSafeInteger(family.typeArgumentCount) || family.typeArgumentCount < 0) {
    collector.add(`${path}.typeArgumentCount`, "Provider source type-family arity must be a non-negative safe integer.", family.typeArgumentCount);
  }
  if (family.typeArgumentCount !== typeParameterCount) {
    collector.add(`${path}.typeArgumentCount`, "Provider source type-family arity must match the declaration type parameter count.", family.typeArgumentCount);
  }
}

function validateDotnetMemberList(
  members: readonly DotnetMemberDeclaration[],
  path: string,
  collector: ContractCollector,
  options: {
    readonly sourceVisible: boolean;
  },
): void {
  for (const [index, member] of members.entries()) {
    const memberPath = `${path}[${index}]`;
    if (!requireSupportedDiscriminant(
      (member as unknown as Readonly<Record<string, unknown>>).kind,
      `${memberPath}.kind`,
      collector,
      ".NET member declaration kind",
      supportedDotnetMemberKinds,
    )) {
      continue;
    }
    requireNonEmptyString(member.sourceName, `${memberPath}.sourceName`, collector);
    requireNonEmptyString(member.targetName, `${memberPath}.targetName`, collector);
    validateDotnetTargetIdentity(member.targetId, member.metadataName, `${memberPath}.targetId`, `${memberPath}.metadataName`, collector);
    if (member.sourceReceiverParameterIndex !== undefined && (!Number.isSafeInteger(member.sourceReceiverParameterIndex) || member.sourceReceiverParameterIndex < 0)) {
      collector.add(`${memberPath}.sourceReceiverParameterIndex`, "Source receiver parameter index must be a non-negative safe integer.", member.sourceReceiverParameterIndex);
    }
    validateDotnetSourceProjection(member, memberPath, collector);
    validateOptionalDotnetTypeRef(member.targetDeclaringType, `${memberPath}.targetDeclaringType`, collector, { allowLiteral: false, allowProviderRef: false, targetPosition: true });
    switch (member.kind) {
      case "constructor":
      case "method":
      case "indexer":
      case "operator":
        validateDotnetSignatureList(member.signatures ?? [], `${memberPath}.signatures`, collector, { requireReturnType: member.kind !== "constructor" });
        if ((member.signatures ?? []).length === 0) {
          collector.add(`${memberPath}.signatures`, `${member.kind} members must carry at least one supported signature.`);
        }
        break;
      case "property":
      case "field":
      case "event":
        if (member.type === undefined) {
          collector.add(`${memberPath}.type`, `${member.kind} members must carry a closed target type.`);
        } else {
          validateDotnetTypeRef(member.type, `${memberPath}.type`, collector, { allowLiteral: false, allowProviderRef: false, targetPosition: true });
        }
        validateOptionalDotnetTypeRef(member.sourceType, `${memberPath}.sourceType`, collector, { allowLiteral: false, allowProviderRef: true });
        if (member.returnPassing !== undefined) {
          if (!supportedReturnPassingModes.has(member.returnPassing)) {
            collector.add(`${memberPath}.returnPassing`, "Member returnPassing is not a supported .NET return ABI.", member.returnPassing);
          }
          if (
            member.kind !== "property" ||
            member.sourceType?.kind !== "provider-ref" ||
            member.sourceType.moduleSpecifier !== "@tsonic/core/types.js" ||
            member.sourceType.exportName !== "Pointer" ||
            member.sourceType.typeArguments?.length !== 1
          ) {
            collector.add(`${memberPath}.sourceType`, "A by-reference property must expose the exact shared Pointer<T> source location contract.", member.sourceType);
          }
        } else if (member.sourceType !== undefined) {
          collector.add(`${memberPath}.returnPassing`, "A distinct property source type requires an explicit return ABI.");
        }
        break;
    }
  }
}

function validateDotnetSourceProjection(
  member: DotnetMemberDeclaration,
  path: string,
  collector: ContractCollector,
): void {
  if (
    member.sourceProjection !== undefined &&
    member.sourceProjection !== "extension-method" &&
    member.sourceProjection !== "operator-adapter"
  ) {
    collector.add(
      `${path}.sourceProjection`,
      "Unsupported .NET source projection kind.",
      member.sourceProjection,
    );
    return;
  }
  const hasTargetParameterReceiverShape =
    member.static === true &&
    member.sourceStatic === false &&
    member.receiverPassing === "target-parameter" &&
    member.sourceReceiverParameterIndex !== undefined;
  const hasExtensionMethodShape = member.kind === "method" &&
    member.sourceReceiverParameterIndex === 0 &&
    hasTargetParameterReceiverShape;
  const hasOperatorAdapterShape = member.kind === "operator" &&
    hasTargetParameterReceiverShape;
  if (member.sourceProjection === "extension-method" && !hasExtensionMethodShape) {
    collector.add(
      `${path}.sourceProjection`,
      "Extension-method source projections require a static target method, an instance source member, and exact target parameter zero as the source receiver.",
      member.sourceProjection,
    );
  }
  if (member.sourceProjection === "operator-adapter" && !hasOperatorAdapterShape) {
    collector.add(
      `${path}.sourceProjection`,
      "Operator source projections require a static target operator, an instance source member, and one exact target receiver parameter.",
      member.sourceProjection,
    );
  }
  if (hasExtensionMethodShape && member.sourceProjection !== "extension-method" ||
      hasOperatorAdapterShape && member.sourceProjection !== "operator-adapter") {
    collector.add(
      `${path}.sourceProjection`,
      "Extension-method projection metadata must be explicit.",
      member.sourceProjection,
    );
  }
}
