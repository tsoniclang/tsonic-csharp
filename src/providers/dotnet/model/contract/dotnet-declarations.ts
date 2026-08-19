import { dotnetConversionOperatorNameMatchesKind, hasMatchingUnsupportedMember, validateDotnetTargetIdentity, validateOptionalDotnetAssemblyReference, validateOptionalDotnetRenderShape } from "./dotnet-identities.js";
import { requireNonEmptyString, requireSupportedDiscriminant, requireUnique, supportedDotnetConversionKinds, supportedDotnetConversionOperatorNames, supportedDotnetExportKinds, supportedDotnetMemberKinds, supportedDotnetTypeKinds } from "./support.js";
import { validateDotnetConstraints, validateDotnetSignatureList, validateDotnetTypeParameters, validateUnsupportedConstraints, validateUnsupportedMembers } from "./dotnet-signatures.js";
import { validateDotnetTypeRef, validateNoUnsupportedClrSourceTypeRef, validateOptionalDotnetTypeRef, validateOptionalNoUnsupportedClrSourceTypeRef } from "./dotnet-types.js";
import type {
  DotnetExportDeclaration,
  DotnetMemberDeclaration,
  DotnetTypeDeclaration,
  DotnetUnsupportedMemberDeclaration,
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
  validateOptionalDotnetTypeRef(declaration.baseType, `${path}.baseType`, collector, { allowLiteral: false, allowProviderRef: true, targetPosition: true });
  validateDotnetConstraints(declaration.implementedContracts ?? [], `${path}.implementedContracts`, collector);
  validateUnsupportedConstraints(declaration.unsupportedImplementedContracts ?? [], `${path}.unsupportedImplementedContracts`, collector);
  const unsupportedMembers = declaration.unsupportedMembers ?? [];
  validateDotnetMemberList(declaration.members ?? [], `${path}.members`, collector, {
    sourceVisible: options.sourceVisible,
    unsupportedMembers,
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
    validateNoUnsupportedClrSourceTypeRef(operator.sourceType, `${operatorPath}.sourceType`, collector, "Conversion operator source type");
    validateNoUnsupportedClrSourceTypeRef(operator.targetType, `${operatorPath}.targetType`, collector, "Conversion operator target type");
  }
  validateOptionalDotnetTypeRef(declaration.sourceShape, `${path}.sourceShape`, collector, { allowLiteral: true, allowProviderRef: true });
  if (options.sourceVisible) {
    validateOptionalNoUnsupportedClrSourceTypeRef(declaration.sourceShape, `${path}.sourceShape`, collector, "Source-visible type sourceShape");
  }
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
    readonly unsupportedMembers: readonly DotnetUnsupportedMemberDeclaration[];
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
    if (member.sourceParameterOffset !== undefined && (!Number.isSafeInteger(member.sourceParameterOffset) || member.sourceParameterOffset < 0)) {
      collector.add(`${memberPath}.sourceParameterOffset`, "Source parameter offset must be a non-negative safe integer.", member.sourceParameterOffset);
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
        if (options.sourceVisible) {
          validateSourceVisibleCallableMemberClrShapes(member, memberPath, collector);
        }
        break;
      case "property":
      case "field":
      case "event":
        if (member.type === undefined) {
          collector.add(`${memberPath}.type`, `${member.kind} members must carry a closed target type.`);
        } else {
          validateDotnetTypeRef(member.type, `${memberPath}.type`, collector, { allowLiteral: false, allowProviderRef: false, targetPosition: true });
          if (options.sourceVisible) {
            validateNoUnsupportedClrSourceTypeRef(member.type, `${memberPath}.type`, collector, `Source-visible ${member.kind} member type`);
          }
        }
        if (options.sourceVisible && member.kind === "event" && !hasMatchingUnsupportedMember(options.unsupportedMembers, member, "event")) {
          collector.add(
            `${memberPath}.targetId`,
            "Source-visible event members must carry matching unsupported source-event evidence until provider event semantics exist.",
            member.targetId,
          );
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
    member.sourceProjection !== "extension-method"
  ) {
    collector.add(
      `${path}.sourceProjection`,
      "Unsupported .NET source projection kind.",
      member.sourceProjection,
    );
    return;
  }
  const hasExtensionMethodShape = member.kind === "method" &&
    member.static === true &&
    member.sourceStatic === false &&
    member.receiverPassing === "first-argument" &&
    member.sourceParameterOffset === 1;
  if (member.sourceProjection === "extension-method" && !hasExtensionMethodShape) {
    collector.add(
      `${path}.sourceProjection`,
      "Extension-method source projections require a static target method, an instance source member, first-argument receiver passing, and one omitted source parameter.",
      member.sourceProjection,
    );
  }
  if (hasExtensionMethodShape && member.sourceProjection !== "extension-method") {
    collector.add(
      `${path}.sourceProjection`,
      "Extension-method projection metadata must be explicit.",
      member.sourceProjection,
    );
  }
}

function validateSourceVisibleCallableMemberClrShapes(
  member: DotnetMemberDeclaration,
  path: string,
  collector: ContractCollector,
): void {
  for (const [signatureIndex, signature] of (member.signatures ?? []).entries()) {
    const signaturePath = `${path}.signatures[${signatureIndex}]`;
    for (const [parameterIndex, parameter] of signature.parameters.slice(member.sourceParameterOffset ?? 0).entries()) {
      validateNoUnsupportedClrSourceTypeRef(
        parameter.sourceType ?? parameter.type,
        `${signaturePath}.parameters[${parameterIndex + (member.sourceParameterOffset ?? 0)}].${parameter.sourceType === undefined ? "type" : "sourceType"}`,
        collector,
        `Source-visible ${member.kind} parameter '${parameter.name}' type`,
      );
    }
    if (signature.returnType !== undefined) {
      validateNoUnsupportedClrSourceTypeRef(
        signature.returnType,
        `${signaturePath}.returnType`,
        collector,
        `Source-visible ${member.kind} return type`,
      );
    }
  }
}
