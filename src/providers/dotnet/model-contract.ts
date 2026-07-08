import type {
  ProviderDeclarationModel,
  ProviderExportDeclaration,
  ProviderHeritageDeclaration,
  ProviderMemberDeclaration,
  ProviderParameterDeclaration,
  ProviderSignatureDeclaration,
  TargetIdentity,
  ProviderTypeExpression,
  ProviderTypeParameterDeclaration,
} from "@tsonic/tsts";
import type {
  DotnetConstraint,
  DotnetAssemblyReference,
  DotnetConversionOperatorDeclaration,
  DotnetExportDeclaration,
  DotnetMemberDeclaration,
  DotnetModuleModel,
  DotnetParameterDeclaration,
  DotnetParameterDefaultValue,
  DotnetSignatureDeclaration,
  DotnetTypeDeclaration,
  DotnetTypeParameterDeclaration,
  DotnetTypeRef,
  DotnetUnsupportedDefaultValueDeclaration,
  DotnetUnsupportedConstraintDeclaration,
  DotnetUnsupportedExportDeclaration,
  DotnetUnsupportedMemberDeclaration,
} from "./model.js";
import type {
  DotnetRenderShape,
} from "./model-types.js";
import type {
  DotnetProviderDiagnostic,
} from "./provider.js";

const supportedPassingModes = new Set([
  "by-value",
  "byref-readonly",
  "byref-readwrite",
  "byref-writeonly-must-init",
]);

const supportedTypeParameterVariance = new Set([
  "in",
  "out",
  "invariant",
  "target-defined",
]);

const supportedDotnetExportKinds = new Set([
  "type",
  "function",
  "value",
  "namespace",
]);

const supportedDotnetTypeKinds = new Set([
  "class",
  "struct",
  "interface",
  "enum",
  "delegate",
  "opaque",
]);

const supportedDotnetMemberKinds = new Set([
  "constructor",
  "method",
  "property",
  "field",
  "indexer",
  "event",
  "operator",
]);

const supportedDotnetConversionOperatorNames = new Set([
  "op_Implicit",
  "op_Explicit",
]);

const supportedDotnetConversionKinds = new Set([
  "implicit",
  "explicit",
]);

const supportedDotnetConstraintKinds = new Set([
  "implements",
  "value-type",
  "reference-type",
  "constructible",
  "unmanaged",
  "not-null",
  "target-specific",
]);

const supportedDotnetTypeRefKinds = new Set([
  "void",
  "any",
  "unknown",
  "object",
  "string",
  "literal",
  "boolean",
  "number",
  "bigint",
  "source-primitive",
  "type-parameter",
  "provider-ref",
  "named",
  "nullable",
  "array",
  "tuple",
  "union",
  "function",
  "pointer",
  "function-pointer",
  "opaque",
]);

const supportedDotnetRenderShapeKinds = new Set([
  "named",
]);

const dotnetTypeRefFieldsByKind = new Map<string, ReadonlySet<string>>([
  ["void", new Set(["kind"])],
  ["any", new Set(["kind"])],
  ["unknown", new Set(["kind"])],
  ["object", new Set(["kind"])],
  ["string", new Set(["kind"])],
  ["literal", new Set(["kind", "value"])],
  ["boolean", new Set(["kind"])],
  ["number", new Set(["kind"])],
  ["bigint", new Set(["kind"])],
  ["source-primitive", new Set(["kind", "name"])],
  ["type-parameter", new Set(["kind", "name"])],
  ["provider-ref", new Set(["kind", "moduleSpecifier", "exportName", "typeArguments"])],
  ["named", new Set(["kind", "targetId", "metadataName", "displayName", "renderShape", "typeArguments", "sourceShape"])],
  ["nullable", new Set(["kind", "elementType"])],
  ["array", new Set(["kind", "elementType", "rank"])],
  ["tuple", new Set(["kind", "elements"])],
  ["union", new Set(["kind", "types"])],
  ["function", new Set(["kind", "parameters", "returnType", "typeParameters"])],
  ["pointer", new Set(["kind", "pointee", "mutability"])],
  ["function-pointer", new Set(["kind", "args", "result", "abi"])],
  ["opaque", new Set(["kind", "id", "displayName", "sourceShape"])],
]);

export function validateDotnetModuleModelContract(module: DotnetModuleModel): DotnetProviderDiagnostic | undefined {
  const collector = createContractCollector("DOTNET_PROVIDER_MODEL_CONTRACT_INVALID", "Invalid .NET provider model contract.");
  requireNonEmptyString(module.moduleSpecifier, "$.moduleSpecifier", collector);
  requireNonEmptyString(module.namespaceName, "$.namespaceName", collector);
  validateOptionalDotnetAssemblyReference(module.assembly, "$.assembly", collector);
  validateExportList(module.exports, "$.exports", collector, { sourceVisible: true });
  validateExportList(module.targetOnlyTypes ?? [], "$.targetOnlyTypes", collector, { sourceVisible: false });
  validateUnsupportedExports(module.unsupportedExports ?? [], "$.unsupportedExports", collector);
  return collector.diagnostic();
}

export function validateDotnetProviderDeclarationModelContract(model: ProviderDeclarationModel): DotnetProviderDiagnostic | undefined {
  const collector = createContractCollector("DOTNET_PROVIDER_DECLARATION_CONTRACT_INVALID", "Invalid .NET provider declaration contract.");
  requireNonEmptyString(model.moduleSpecifier, "$.moduleSpecifier", collector);
  requireNonEmptyString(model.providerModuleId, "$.providerModuleId", collector);
  const exportIds = new Set<string>();
  const exportNames = new Set<string>();
  for (const [index, declaration] of model.exports.entries()) {
    const path = `$.exports[${index}]`;
    requireNonEmptyString(declaration.id, `${path}.id`, collector);
    requireNonEmptyString(declaration.name, `${path}.name`, collector);
    requireUnique(exportIds, declaration.id, `${path}.id`, collector);
    requireUnique(exportNames, declaration.exportName ?? declaration.name, `${path}.exportName`, collector);
    validateProviderExportDeclaration(declaration, path, collector);
  }
  return collector.diagnostic();
}

interface ContractCollector {
  readonly add: (path: string, message: string, value?: unknown) => void;
  readonly diagnostic: () => DotnetProviderDiagnostic | undefined;
}

function createContractCollector(code: string, message: string): ContractCollector {
  const evidence: Readonly<Record<string, unknown>>[] = [];
  return {
    add(path, failure, value) {
      evidence.push({
        path,
        failure,
        ...(value !== undefined ? { value: summarizeContractValue(value) } : {}),
      });
    },
    diagnostic() {
      return evidence.length === 0
        ? undefined
        : {
            code,
            message,
            evidence,
          };
    },
  };
}

function validateExportList(
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

function validateSourceVisibleCallableMemberClrShapes(
  member: DotnetMemberDeclaration,
  path: string,
  collector: ContractCollector,
): void {
  for (const [signatureIndex, signature] of (member.signatures ?? []).entries()) {
    const signaturePath = `${path}.signatures[${signatureIndex}]`;
    for (const [parameterIndex, parameter] of signature.parameters.entries()) {
      validateNoUnsupportedClrSourceTypeRef(
        parameter.type,
        `${signaturePath}.parameters[${parameterIndex}].type`,
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

function validateDotnetSignatureList(
  signatures: readonly DotnetSignatureDeclaration[],
  path: string,
  collector: ContractCollector,
  options: { readonly requireReturnType: boolean },
): void {
  const signatureIds = new Set<string>();
  for (const [index, signature] of signatures.entries()) {
    const signaturePath = `${path}[${index}]`;
    requireNonEmptyString(signature.id, `${signaturePath}.id`, collector);
    requireUnique(signatureIds, signature.id, `${signaturePath}.id`, collector);
    if (signature.providerSourceSignatureId !== undefined) {
      requireNonEmptyString(signature.providerSourceSignatureId, `${signaturePath}.providerSourceSignatureId`, collector);
    }
    validateDotnetTypeParameters(signature.typeParameters ?? [], `${signaturePath}.typeParameters`, collector);
    validateDotnetParameters(signature.parameters, `${signaturePath}.parameters`, collector);
    if (signature.returnType === undefined) {
      if (options.requireReturnType) {
        collector.add(`${signaturePath}.returnType`, "Non-constructor signatures must carry an explicit returnType.");
      }
    } else {
      validateDotnetTypeRef(signature.returnType, `${signaturePath}.returnType`, collector, {
        allowLiteral: false,
        allowProviderRef: signature.targetReturnType !== undefined,
        targetPosition: signature.targetReturnType === undefined,
      });
    }
    validateOptionalDotnetTypeRef(signature.targetReturnType, `${signaturePath}.targetReturnType`, collector, { allowLiteral: false, allowProviderRef: false, targetPosition: true });
  }
}

function validateDotnetParameters(
  parameters: readonly DotnetParameterDeclaration[],
  path: string,
  collector: ContractCollector,
): void {
  for (const [index, parameter] of parameters.entries()) {
    const parameterPath = `${path}[${index}]`;
    requireNonEmptyString(parameter.name, `${parameterPath}.name`, collector);
    validateDotnetTypeRef(parameter.type, `${parameterPath}.type`, collector, { allowLiteral: false, allowProviderRef: false, targetPosition: true });
    if (!supportedPassingModes.has(parameter.passingMode)) {
      collector.add(`${parameterPath}.passingMode`, "Parameter passingMode is not a supported provider contract value.", parameter.passingMode);
    }
    if (parameter.rest === true) {
      if (index !== parameters.length - 1) {
        collector.add(`${parameterPath}.rest`, "Params-array/rest parameters must be the final parameter.");
      }
      if (parameter.passingMode !== "by-value") {
        collector.add(`${parameterPath}.passingMode`, "Params-array/rest parameters must be passed by value.", parameter.passingMode);
      }
      if (parameter.type.kind !== "array") {
        collector.add(`${parameterPath}.type`, "Params-array/rest parameters must carry an array target type.", parameter.type);
      }
    }
    if (parameter.defaultValue !== undefined && parameter.optional !== true) {
      collector.add(`${parameterPath}.defaultValue`, "Default parameter values must only appear on optional parameters.");
    }
    if (parameter.unsupportedDefaultValue !== undefined && parameter.optional !== true) {
      collector.add(`${parameterPath}.unsupportedDefaultValue`, "Unsupported default value evidence must only appear on optional parameters.");
    }
    if (parameter.defaultValue !== undefined && parameter.unsupportedDefaultValue !== undefined) {
      collector.add(`${parameterPath}.unsupportedDefaultValue`, "A parameter cannot carry both supported and unsupported default value facts.");
    }
    validateOptionalDotnetParameterDefaultValue(parameter.defaultValue, `${parameterPath}.defaultValue`, collector);
    validateOptionalDotnetUnsupportedDefaultValue(parameter.unsupportedDefaultValue, `${parameterPath}.unsupportedDefaultValue`, collector);
  }
}

function validateDotnetTypeParameters(
  parameters: readonly DotnetTypeParameterDeclaration[],
  path: string,
  collector: ContractCollector,
): void {
  const names = new Set<string>();
  for (const [index, parameter] of parameters.entries()) {
    const parameterPath = `${path}[${index}]`;
    requireNonEmptyString(parameter.name, `${parameterPath}.name`, collector);
    requireUnique(names, parameter.name, `${parameterPath}.name`, collector);
    validateDotnetConstraints(parameter.constraints ?? [], `${parameterPath}.constraints`, collector);
    validateUnsupportedConstraints(parameter.unsupportedConstraints ?? [], `${parameterPath}.unsupportedConstraints`, collector);
    validateOptionalDotnetTypeRef(parameter.defaultType, `${parameterPath}.defaultType`, collector, { allowLiteral: false, allowProviderRef: false });
    if (parameter.variance !== undefined && !supportedTypeParameterVariance.has(parameter.variance)) {
      collector.add(`${parameterPath}.variance`, "Type parameter variance is not a supported provider contract value.", parameter.variance);
    }
  }
}

function validateDotnetConstraints(
  constraints: readonly DotnetConstraint[],
  path: string,
  collector: ContractCollector,
): void {
  for (const [index, constraint] of constraints.entries()) {
    const constraintPath = `${path}[${index}]`;
    if (!requireSupportedDiscriminant(
      (constraint as unknown as Readonly<Record<string, unknown>>).kind,
      `${constraintPath}.kind`,
      collector,
      ".NET constraint kind",
      supportedDotnetConstraintKinds,
    )) {
      continue;
    }
    if (constraint.kind === "implements") {
      validateDotnetTypeRef(constraint.contract, `${constraintPath}.contract`, collector, { allowLiteral: false, allowProviderRef: false, targetPosition: true });
    }
    if (constraint.kind === "target-specific") {
      requireNonEmptyString(constraint.name, `${constraintPath}.name`, collector);
    }
  }
}

function validateUnsupportedConstraints(
  constraints: readonly DotnetUnsupportedConstraintDeclaration[],
  path: string,
  collector: ContractCollector,
): void {
  for (const [index, constraint] of constraints.entries()) {
    const constraintPath = `${path}[${index}]`;
    validateDotnetTargetIdentity(constraint.targetId, constraint.metadataName, `${constraintPath}.targetId`, `${constraintPath}.metadataName`, collector);
    requireNonEmptyString(constraint.reason, `${constraintPath}.reason`, collector);
  }
}

function validateUnsupportedMembers(
  members: readonly DotnetUnsupportedMemberDeclaration[],
  path: string,
  collector: ContractCollector,
): void {
  const memberIds = new Set<string>();
  for (const [index, member] of members.entries()) {
    const memberPath = `${path}[${index}]`;
    requireSupportedDiscriminant(
      (member as unknown as Readonly<Record<string, unknown>>).memberKind,
      `${memberPath}.memberKind`,
      collector,
      ".NET unsupported member kind",
      supportedDotnetMemberKinds,
    );
    requireNonEmptyString(member.sourceName, `${memberPath}.sourceName`, collector);
    requireNonEmptyString(member.targetName, `${memberPath}.targetName`, collector);
    validateDotnetTargetIdentity(member.targetId, member.metadataName, `${memberPath}.targetId`, `${memberPath}.metadataName`, collector);
    requireNonEmptyString(member.reason, `${memberPath}.reason`, collector);
    requireUnique(memberIds, member.targetId, `${memberPath}.targetId`, collector);
  }
}

function validateUnsupportedExports(
  declarations: readonly DotnetUnsupportedExportDeclaration[],
  path: string,
  collector: ContractCollector,
): void {
  const sourceNames = new Set<string>();
  for (const [index, declaration] of declarations.entries()) {
    const declarationPath = `${path}[${index}]`;
    requireNonEmptyString(declaration.sourceName, `${declarationPath}.sourceName`, collector);
    requireUnique(sourceNames, declaration.sourceName, `${declarationPath}.sourceName`, collector);
    requireNonEmptyString(declaration.reason, `${declarationPath}.reason`, collector);
    if (declaration.kind === "unsupported-type-export") {
      validateDotnetTargetIdentity(declaration.targetId, declaration.metadataName, `${declarationPath}.targetId`, `${declarationPath}.metadataName`, collector, {
        assembly: declaration.assembly,
      });
      validateOptionalDotnetAssemblyReference(declaration.assembly, `${declarationPath}.assembly`, collector);
    } else {
      const record = declaration as unknown as Readonly<Record<string, unknown>>;
      const targetIds = Array.isArray(record.targetIds) ? record.targetIds as readonly unknown[] : undefined;
      const metadataNames = Array.isArray(record.metadataNames) ? record.metadataNames as readonly unknown[] : undefined;
      if (targetIds === undefined) {
        collector.add(`${declarationPath}.targetIds`, "Unsupported type-family exports must carry a targetIds array.", record.targetIds);
      }
      if (metadataNames === undefined) {
        collector.add(`${declarationPath}.metadataNames`, "Unsupported type-family exports must carry a metadataNames array.", record.metadataNames);
      }
      if ((targetIds ?? []).length === 0) {
        collector.add(`${declarationPath}.targetIds`, "Unsupported type-family exports must identify every rejected target id.");
      }
      if ((metadataNames ?? []).length === 0) {
        collector.add(`${declarationPath}.metadataNames`, "Unsupported type-family exports must identify every rejected metadata name.");
      }
      if ((targetIds ?? []).length !== (metadataNames ?? []).length) {
        collector.add(`${declarationPath}.targetIds`, "Unsupported type-family targetIds and metadataNames must have matching cardinality.");
      }
      for (const [targetIndex, targetId] of (targetIds ?? []).entries()) {
        const metadataName = metadataNames?.[targetIndex];
        validateDotnetTargetIdentity(
          typeof targetId === "string" ? targetId : undefined,
          typeof metadataName === "string" ? metadataName : undefined,
          `${declarationPath}.targetIds[${targetIndex}]`,
          `${declarationPath}.metadataNames[${targetIndex}]`,
          collector,
          { assembly: declaration.assemblies?.[targetIndex] },
        );
      }
      for (const [assemblyIndex, assembly] of (declaration.assemblies ?? []).entries()) {
        validateDotnetAssemblyReference(assembly, `${declarationPath}.assemblies[${assemblyIndex}]`, collector);
      }
    }
  }
}

function validateOptionalDotnetTypeRef(
  type: DotnetTypeRef | undefined,
  path: string,
  collector: ContractCollector,
  options: { readonly allowLiteral: boolean; readonly allowProviderRef: boolean; readonly targetPosition?: boolean },
): void {
  if (type !== undefined) {
    validateDotnetTypeRef(type, path, collector, options);
  }
}

function validateOptionalNoUnsupportedClrSourceTypeRef(
  type: DotnetTypeRef | undefined,
  path: string,
  collector: ContractCollector,
  context: string,
): void {
  if (type !== undefined) {
    validateNoUnsupportedClrSourceTypeRef(type, path, collector, context);
  }
}

function validateNoUnsupportedClrSourceTypeRef(
  type: DotnetTypeRef,
  path: string,
  collector: ContractCollector,
  context: string,
): void {
  switch (type.kind) {
    case "pointer":
      collector.add(path, `${context} uses an unsupported CLR pointer type. Move the row to unsupported member/export evidence instead of exposing it as supported metadata.`, type);
      validateNoUnsupportedClrSourceTypeRef(type.pointee, `${path}.pointee`, collector, context);
      return;
    case "function-pointer":
      collector.add(path, `${context} uses an unsupported CLR function-pointer type. Move the row to unsupported member/export evidence instead of exposing it as supported metadata.`, type);
      validateDotnetTypeRefsForUnsupportedClrSourceShapes(type.args, `${path}.args`, collector, context);
      validateNoUnsupportedClrSourceTypeRef(type.result, `${path}.result`, collector, context);
      return;
    case "array":
      if (type.rank !== undefined && type.rank !== 1) {
        collector.add(path, `${context} uses an unsupported ranked CLR array type. Move the row to unsupported member/export evidence instead of exposing it as supported metadata.`, type);
      }
      validateNoUnsupportedClrSourceTypeRef(type.elementType, `${path}.elementType`, collector, context);
      return;
    case "nullable":
      validateNoUnsupportedClrSourceTypeRef(type.elementType, `${path}.elementType`, collector, context);
      return;
    case "tuple":
      validateDotnetTypeRefsForUnsupportedClrSourceShapes(type.elements, `${path}.elements`, collector, context);
      return;
    case "union":
      validateDotnetTypeRefsForUnsupportedClrSourceShapes(type.types, `${path}.types`, collector, context);
      return;
    case "function":
      for (const [index, parameter] of type.parameters.entries()) {
        validateNoUnsupportedClrSourceTypeRef(parameter.type, `${path}.parameters[${index}].type`, collector, context);
      }
      validateNoUnsupportedClrSourceTypeRef(type.returnType, `${path}.returnType`, collector, context);
      return;
    case "named":
      validateDotnetTypeRefsForUnsupportedClrSourceShapes(type.typeArguments ?? [], `${path}.typeArguments`, collector, context);
      validateOptionalNoUnsupportedClrSourceTypeRef(type.sourceShape, `${path}.sourceShape`, collector, context);
      return;
    case "provider-ref":
      validateDotnetTypeRefsForUnsupportedClrSourceShapes(type.typeArguments ?? [], `${path}.typeArguments`, collector, context);
      return;
    case "opaque":
      validateOptionalNoUnsupportedClrSourceTypeRef(type.sourceShape, `${path}.sourceShape`, collector, context);
      return;
    case "void":
    case "any":
    case "unknown":
    case "object":
    case "string":
    case "literal":
    case "boolean":
    case "number":
    case "bigint":
    case "source-primitive":
    case "type-parameter":
      return;
  }
}

function validateDotnetTypeRefsForUnsupportedClrSourceShapes(
  types: readonly DotnetTypeRef[],
  path: string,
  collector: ContractCollector,
  context: string,
): void {
  for (const [index, type] of types.entries()) {
    validateNoUnsupportedClrSourceTypeRef(type, `${path}[${index}]`, collector, context);
  }
}

function validateDotnetTypeRef(
  type: DotnetTypeRef,
  path: string,
  collector: ContractCollector,
  options: { readonly allowLiteral: boolean; readonly allowProviderRef: boolean; readonly targetPosition?: boolean },
): void {
  if (!requireSupportedDiscriminant(
    (type as unknown as Readonly<Record<string, unknown>>).kind,
    `${path}.kind`,
    collector,
    ".NET type ref kind",
    supportedDotnetTypeRefKinds,
  )) {
    return;
  }
  validateDotnetTypeRefFields(type, path, collector);
  switch (type.kind) {
    case "literal":
      if (!options.allowLiteral) {
        collector.add(path, "Literal type refs are source declaration shapes only and are not valid target metadata refs.", type);
      }
      return;
    case "provider-ref":
      if (!options.allowProviderRef) {
        collector.add(path, "Provider-ref type refs are source declaration shapes only and are not valid target metadata refs.", type);
      }
      validateDotnetRawProviderRef(type, path, collector);
      validateDotnetTypeRefs(type.typeArguments ?? [], `${path}.typeArguments`, collector, options);
      return;
    case "named":
      validateDotnetTargetIdentity(type.targetId, type.metadataName, `${path}.targetId`, `${path}.metadataName`, collector);
      validateOptionalDotnetRenderShape(type.renderShape, `${path}.renderShape`, collector);
      validateDotnetTypeRefs(type.typeArguments ?? [], `${path}.typeArguments`, collector, options);
      validateOptionalDotnetTypeRef(type.sourceShape, `${path}.sourceShape`, collector, { allowLiteral: true, allowProviderRef: true });
      return;
    case "array":
      if (type.rank !== undefined && (!Number.isInteger(type.rank) || type.rank < 1)) {
        collector.add(`${path}.rank`, "Array rank must be a positive integer.", type.rank);
      }
      validateDotnetTypeRef(type.elementType, `${path}.elementType`, collector, options);
      return;
    case "nullable":
      validateDotnetTypeRef(type.elementType, `${path}.elementType`, collector, options);
      return;
    case "tuple":
      validateDotnetTypeRefs(type.elements, `${path}.elements`, collector, options);
      return;
    case "union":
      if (options.targetPosition === true) {
        collector.add(path, "Union type refs are source declaration shapes only and require an explicit closed target type fact before target emission.", type);
      }
      if (type.types.length === 0) {
        collector.add(`${path}.types`, "Union type refs must contain at least one type.");
      }
      validateDotnetTypeRefs(type.types, `${path}.types`, collector, options);
      return;
    case "function":
      validateDotnetTypeParameters(type.typeParameters ?? [], `${path}.typeParameters`, collector);
      validateDotnetParameters(type.parameters, `${path}.parameters`, collector);
      validateDotnetTypeRef(type.returnType, `${path}.returnType`, collector, options);
      return;
    case "pointer":
      validateDotnetTypeRef(type.pointee, `${path}.pointee`, collector, options);
      return;
    case "function-pointer":
      validateDotnetTypeRefs(type.args, `${path}.args`, collector, options);
      validateDotnetTypeRef(type.result, `${path}.result`, collector, options);
      return;
    case "opaque":
      requireNonEmptyString(type.id, `${path}.id`, collector);
      validateOptionalDotnetTypeRef(type.sourceShape, `${path}.sourceShape`, collector, { allowLiteral: true, allowProviderRef: true });
      return;
    case "void":
    case "any":
    case "unknown":
    case "object":
    case "string":
    case "boolean":
    case "number":
    case "bigint":
      return;
    case "source-primitive":
    case "type-parameter":
      requireNonEmptyString(type.name, `${path}.name`, collector);
      return;
  }
}

function validateDotnetTypeRefFields(
  type: DotnetTypeRef,
  path: string,
  collector: ContractCollector,
): void {
  const record = type as unknown as Readonly<Record<string, unknown>>;
  const allowed = dotnetTypeRefFieldsByKind.get(String(record.kind));
  if (allowed === undefined) {
    return;
  }
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      collector.add(`${path}.${key}`, "Field is not valid for this .NET type-ref variant.", record[key]);
    }
  }
}

function validateDotnetTypeRefs(
  types: readonly DotnetTypeRef[],
  path: string,
  collector: ContractCollector,
  options: { readonly allowLiteral: boolean; readonly allowProviderRef: boolean; readonly targetPosition?: boolean },
): void {
  for (const [index, type] of types.entries()) {
    validateDotnetTypeRef(type, `${path}[${index}]`, collector, options);
  }
}

function validateProviderExportDeclaration(
  declaration: ProviderExportDeclaration,
  path: string,
  collector: ContractCollector,
): void {
  if (declaration.kind !== "namespace") {
    validateProviderTargetIdentity(declaration.targetIdentity, `${path}.targetIdentity`, collector);
  }
  validateOptionalProviderTypeExpression(declaration.type, `${path}.type`, collector);
  validateProviderTypeParameters(declaration.typeParameters ?? [], `${path}.typeParameters`, collector);
  for (const [index, heritage] of (declaration.heritage ?? []).entries()) {
    validateProviderHeritage(heritage, `${path}.heritage[${index}]`, collector);
  }
  validateProviderMemberList(declaration.members ?? [], `${path}.members`, collector);
  validateProviderSignatureList(declaration.signatures ?? [], `${path}.signatures`, collector, { requireReturnType: declaration.kind === "function" });
}

function validateProviderMemberList(
  members: readonly ProviderMemberDeclaration[],
  path: string,
  collector: ContractCollector,
): void {
  const memberIds = new Set<string>();
  for (const [index, member] of members.entries()) {
    const memberPath = `${path}[${index}]`;
    requireNonEmptyString(member.id, `${memberPath}.id`, collector);
    requireUnique(memberIds, member.id, `${memberPath}.id`, collector);
    validateOptionalProviderTypeExpression(member.type, `${memberPath}.type`, collector);
    validateProviderSignatureList(member.signatures ?? [], `${memberPath}.signatures`, collector, {
      requireReturnType: member.kind === "method" || member.kind === "indexer",
    });
  }
}

function validateProviderSignatureList(
  signatures: readonly ProviderSignatureDeclaration[],
  path: string,
  collector: ContractCollector,
  options: { readonly requireReturnType: boolean },
): void {
  const signatureIds = new Set<string>();
  for (const [index, signature] of signatures.entries()) {
    const signaturePath = `${path}[${index}]`;
    requireNonEmptyString(signature.id, `${signaturePath}.id`, collector);
    requireUnique(signatureIds, signature.id, `${signaturePath}.id`, collector);
    validateProviderTypeParameters(signature.typeParameters ?? [], `${signaturePath}.typeParameters`, collector);
    for (const [parameterIndex, parameter] of signature.parameters.entries()) {
      validateProviderParameter(parameter, `${signaturePath}.parameters[${parameterIndex}]`, collector, {
        index: parameterIndex,
        count: signature.parameters.length,
      });
    }
    if (signature.returnType === undefined) {
      if (options.requireReturnType) {
        collector.add(`${signaturePath}.returnType`, "Provider signatures that model callable source members must carry returnType.");
      }
    } else {
      validateProviderTypeExpression(signature.returnType, `${signaturePath}.returnType`, collector);
    }
  }
}

function validateProviderParameter(
  parameter: ProviderParameterDeclaration,
  path: string,
  collector: ContractCollector,
  options: { readonly index: number; readonly count: number },
): void {
  requireNonEmptyString(parameter.name, `${path}.name`, collector);
  validateProviderTypeExpression(parameter.type, `${path}.type`, collector);
  validateOptionalProviderTypeExpression(parameter.defaultType, `${path}.defaultType`, collector);
  if (parameter.passingMode !== undefined && !supportedPassingModes.has(parameter.passingMode)) {
    collector.add(`${path}.passingMode`, "Provider declaration parameter passingMode is not a supported provider contract value.", parameter.passingMode);
  }
  if (parameter.rest === true) {
    if (options.index !== options.count - 1) {
      collector.add(`${path}.rest`, "Provider declaration rest parameters must be the final parameter.");
    }
    if (parameter.passingMode !== undefined && parameter.passingMode !== "by-value") {
      collector.add(`${path}.passingMode`, "Provider declaration rest parameters must be passed by value.", parameter.passingMode);
    }
    if (parameter.type.kind !== "array") {
      collector.add(`${path}.type`, "Provider declaration rest parameters must carry an array source type.", parameter.type);
    }
  }
}

function validateProviderHeritage(
  heritage: ProviderHeritageDeclaration,
  path: string,
  collector: ContractCollector,
): void {
  validateProviderTypeExpression(heritage.type, `${path}.type`, collector);
}

function validateProviderTypeParameters(
  parameters: readonly ProviderTypeParameterDeclaration[],
  path: string,
  collector: ContractCollector,
): void {
  const names = new Set<string>();
  for (const [index, parameter] of parameters.entries()) {
    const parameterPath = `${path}[${index}]`;
    requireNonEmptyString(parameter.name, `${parameterPath}.name`, collector);
    requireUnique(names, parameter.name, `${parameterPath}.name`, collector);
    for (const [constraintIndex, constraint] of (parameter.constraints ?? []).entries()) {
      validateProviderTypeExpression(constraint, `${parameterPath}.constraints[${constraintIndex}]`, collector);
    }
    validateOptionalProviderTypeExpression(parameter.defaultType, `${parameterPath}.defaultType`, collector);
    if (parameter.variance !== undefined && !supportedTypeParameterVariance.has(parameter.variance)) {
      collector.add(`${parameterPath}.variance`, "Provider type parameter variance is not a supported contract value.", parameter.variance);
    }
  }
}

function validateDotnetRawProviderRef(
  type: DotnetTypeRef,
  path: string,
  collector: ContractCollector,
): void {
  const record = type as unknown as Readonly<Record<string, unknown>>;
  if (stringProperty(record, "exportName") === undefined) {
    collector.add(`${path}.exportName`, "Raw .NET provider-ref source shapes must identify the referenced export name.", record.exportName);
  }
  if (stringProperty(record, "moduleSpecifier") === undefined) {
    collector.add(`${path}.moduleSpecifier`, "Raw .NET provider-ref source shapes must identify the referenced module specifier.", record.moduleSpecifier);
  }
  if ("name" in record) {
    collector.add(`${path}.name`, "Raw .NET provider-ref source shapes must use exportName, not the legacy name field.", record.name);
  }
}

function stringProperty(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function validateOptionalProviderTypeExpression(
  type: ProviderTypeExpression | undefined,
  path: string,
  collector: ContractCollector,
): void {
  if (type !== undefined) {
    validateProviderTypeExpression(type, path, collector);
  }
}

function validateProviderTypeExpression(
  type: ProviderTypeExpression,
  path: string,
  collector: ContractCollector,
): void {
  switch (type.kind) {
    case "provider-ref":
      requireNonEmptyString(type.moduleSpecifier, `${path}.moduleSpecifier`, collector);
      requireNonEmptyString(type.exportName, `${path}.exportName`, collector);
      if ("name" in (type as unknown as Readonly<Record<string, unknown>>)) {
        collector.add(`${path}.name`, "Provider declaration refs must use exportName, not the legacy name field.", (type as unknown as Readonly<Record<string, unknown>>).name);
      }
      for (const [index, argument] of (type.typeArguments ?? []).entries()) {
        validateProviderTypeExpression(argument, `${path}.typeArguments[${index}]`, collector);
      }
      return;
    case "target-named":
      requireNonEmptyString(type.target, `${path}.target`, collector);
      requireNonEmptyString(type.id, `${path}.id`, collector);
      for (const [index, argument] of (type.typeArguments ?? []).entries()) {
        validateProviderTypeExpression(argument, `${path}.typeArguments[${index}]`, collector);
      }
      validateOptionalProviderTypeExpression(type.sourceShape, `${path}.sourceShape`, collector);
      return;
    case "array":
      validateProviderTypeExpression(type.elementType, `${path}.elementType`, collector);
      return;
    case "tuple":
      for (const [index, element] of type.elementTypes.entries()) {
        validateProviderTypeExpression(element, `${path}.elementTypes[${index}]`, collector);
      }
      return;
    case "union":
    case "intersection":
      if (type.types.length === 0) {
        collector.add(`${path}.types`, "Provider union/intersection type expressions must contain at least one type.");
      }
      for (const [index, element] of type.types.entries()) {
        validateProviderTypeExpression(element, `${path}.types[${index}]`, collector);
      }
      return;
    case "function":
      validateProviderTypeParameters(type.typeParameters ?? [], `${path}.typeParameters`, collector);
      for (const [index, parameter] of type.parameters.entries()) {
        validateProviderParameter(parameter, `${path}.parameters[${index}]`, collector, {
          index,
          count: type.parameters.length,
        });
      }
      validateProviderTypeExpression(type.returnType, `${path}.returnType`, collector);
      return;
    case "opaque":
      requireNonEmptyString(type.id, `${path}.id`, collector);
      validateOptionalProviderTypeExpression(type.sourceShape, `${path}.sourceShape`, collector);
      return;
    case "any":
    case "unknown":
    case "void":
    case "never":
    case "boolean":
    case "string":
    case "number":
    case "bigint":
    case "object":
    case "literal":
      return;
    case "source-primitive":
    case "type-parameter":
      requireNonEmptyString(type.name, `${path}.name`, collector);
      return;
  }
}

function validateOptionalDotnetAssemblyReference(
  reference: DotnetAssemblyReference | undefined,
  path: string,
  collector: ContractCollector,
): void {
  if (reference !== undefined) {
    validateDotnetAssemblyReference(reference, path, collector);
  }
}

function validateDotnetAssemblyReference(
  reference: DotnetAssemblyReference,
  path: string,
  collector: ContractCollector,
): void {
  if (reference === null || typeof reference !== "object") {
    collector.add(path, "Assembly reference must be an object.", reference);
    return;
  }
  const record = reference as unknown as Readonly<Record<string, unknown>>;
  requireNonEmptyString(record.name as string | undefined, `${path}.name`, collector);
  requireOptionalNonEmptyString(record.version, `${path}.version`, collector);
  requireOptionalNonEmptyString(record.publicKeyToken, `${path}.publicKeyToken`, collector);
  requireOptionalNonEmptyString(record.culture, `${path}.culture`, collector);
  requireOptionalNonEmptyString(record.path, `${path}.path`, collector);
}

function validateOptionalDotnetRenderShape(
  shape: DotnetRenderShape | undefined,
  path: string,
  collector: ContractCollector,
): void {
  if (shape === undefined) {
    return;
  }
  requireSupportedDiscriminant(
    (shape as unknown as Readonly<Record<string, unknown>>).kind,
    `${path}.kind`,
    collector,
    ".NET render shape kind",
    supportedDotnetRenderShapeKinds,
  );
  requireNonEmptyString(shape.name, `${path}.name`, collector);
  validateOptionalNonNegativeInteger(shape.genericArity, `${path}.genericArity`, collector);
  for (const [index, namespacePart] of (shape.namespace ?? []).entries()) {
    requireNonEmptyString(namespacePart, `${path}.namespace[${index}]`, collector);
  }
  for (const [index, nested] of (shape.nested ?? []).entries()) {
    requireNonEmptyString(nested.name, `${path}.nested[${index}].name`, collector);
    validateOptionalNonNegativeInteger(nested.genericArity, `${path}.nested[${index}].genericArity`, collector);
  }
}

function validateOptionalNonNegativeInteger(
  value: number | undefined,
  path: string,
  collector: ContractCollector,
): void {
  if (value === undefined) {
    return;
  }
  if (!Number.isInteger(value) || value < 0) {
    collector.add(path, "Value must be a non-negative integer.", value);
  }
}

function validateDotnetTargetIdentity(
  targetId: string | undefined,
  metadataName: string | undefined,
  targetPath: string,
  metadataPath: string,
  collector: ContractCollector,
  options: { readonly assembly?: DotnetAssemblyReference } = {},
): void {
  requireNonEmptyString(targetId, targetPath, collector);
  requireNonEmptyString(metadataName, metadataPath, collector);
  if (typeof targetId !== "string" || targetId.length === 0) {
    return;
  }
  if (typeof metadataName === "string" && metadataName.length > 0 && targetId === metadataName) {
    collector.add(targetPath, "Target identity must not fall back to metadataName; it must carry a provider-qualified target id.", targetId);
  }
  const assemblySeparator = targetId.indexOf("::");
  if (assemblySeparator >= 0 && (assemblySeparator === 0 || assemblySeparator === targetId.length - 2)) {
    collector.add(targetPath, "Assembly-qualified target identity must include both assembly identity and metadata identity.", targetId);
  }
  if (options.assembly !== undefined && assemblySeparator < 0) {
    collector.add(targetPath, "Assembly-backed target identity must include an assembly qualifier.", targetId);
  }
  const expectedAssemblyName = options.assembly?.name;
  if (typeof expectedAssemblyName === "string" && expectedAssemblyName.length > 0 && assemblySeparator > 0) {
    const actualAssemblyName = targetId.slice(0, assemblySeparator).split(",")[0] ?? "";
    if (actualAssemblyName !== expectedAssemblyName) {
      collector.add(targetPath, "Assembly-qualified target identity must agree with the assembly reference name.", targetId);
    }
  }
}

function validateProviderTargetIdentity(
  identity: TargetIdentity | undefined,
  path: string,
  collector: ContractCollector,
): void {
  if (identity === undefined) {
    collector.add(path, ".NET provider declarations must carry finalized targetIdentity facts.");
    return;
  }
  requireNonEmptyString(identity.target, `${path}.target`, collector);
  requireNonEmptyString(identity.id, `${path}.id`, collector);
  requireOptionalNonEmptyString(identity.displayName, `${path}.displayName`, collector);
  if (identity.target !== "csharp") {
    collector.add(`${path}.target`, ".NET provider targetIdentity facts must target csharp.", identity.target);
  }
}

function validateOptionalDotnetParameterDefaultValue(
  value: DotnetParameterDefaultValue | undefined,
  path: string,
  collector: ContractCollector,
): void {
  if (value === undefined) {
    return;
  }
  switch (value.kind) {
    case "null":
      return;
    case "string":
      requireString(value.value, `${path}.value`, collector);
      return;
    case "source-primitive":
      requireNonEmptyString(value.name, `${path}.name`, collector);
      if (typeof value.value !== "string" && typeof value.value !== "boolean") {
        collector.add(`${path}.value`, "Source primitive default values must be deterministic strings or booleans.", value.value);
      }
      return;
    case "enum":
      requireNonEmptyString(value.value, `${path}.value`, collector);
      requireOptionalNonEmptyString(value.fieldName, `${path}.fieldName`, collector);
      return;
  }
}

function validateOptionalDotnetUnsupportedDefaultValue(
  value: DotnetUnsupportedDefaultValueDeclaration | undefined,
  path: string,
  collector: ContractCollector,
): void {
  if (value === undefined) {
    return;
  }
  requireNonEmptyString(value.id, `${path}.id`, collector);
  requireNonEmptyString(value.parameterName, `${path}.parameterName`, collector);
  requireNonEmptyString(value.reason, `${path}.reason`, collector);
  for (const [index, evidence] of (value.evidence ?? []).entries()) {
    requireNonEmptyString(evidence.message, `${path}.evidence[${index}].message`, collector);
  }
}

function hasMatchingUnsupportedMember(
  members: readonly DotnetUnsupportedMemberDeclaration[],
  member: DotnetMemberDeclaration,
  memberKind: DotnetUnsupportedMemberDeclaration["memberKind"],
): boolean {
  return members.some((candidate) =>
    candidate.memberKind === memberKind &&
    candidate.targetId === member.targetId &&
    candidate.metadataName === member.metadataName &&
    typeof candidate.reason === "string" &&
    candidate.reason.length > 0
  );
}

function dotnetConversionOperatorNameMatchesKind(
  targetName: DotnetConversionOperatorDeclaration["targetName"],
  conversionKind: DotnetConversionOperatorDeclaration["conversionKind"],
): boolean {
  return (targetName === "op_Implicit" && conversionKind === "implicit") ||
    (targetName === "op_Explicit" && conversionKind === "explicit");
}

function requireSupportedDiscriminant(
  value: unknown,
  path: string,
  collector: ContractCollector,
  description: string,
  supported: ReadonlySet<string>,
): boolean {
  if (typeof value !== "string" || !supported.has(value)) {
    collector.add(path, `Unsupported ${description}.`, value);
    return false;
  }
  return true;
}

function requireNonEmptyString(value: string | undefined, path: string, collector: ContractCollector): void {
  if (typeof value !== "string" || value.length === 0) {
    collector.add(path, "Expected a non-empty string.", value);
  }
}

function requireString(value: unknown, path: string, collector: ContractCollector): void {
  if (typeof value !== "string") {
    collector.add(path, "Expected a string.", value);
  }
}

function requireOptionalNonEmptyString(value: unknown, path: string, collector: ContractCollector): void {
  if (value !== undefined && (typeof value !== "string" || value.length === 0)) {
    collector.add(path, "Expected an omitted value or a non-empty string.", value);
  }
}

function requireUnique(values: Set<string>, value: string | undefined, path: string, collector: ContractCollector): void {
  if (typeof value !== "string" || value.length === 0) {
    return;
  }
  if (values.has(value)) {
    collector.add(path, "Duplicate identity in provider contract.", value);
    return;
  }
  values.add(value);
}

function summarizeContractValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return { kind: "array", length: value.length };
  }
  const record = value as Readonly<Record<string, unknown>>;
  const summary: Record<string, string> = {};
  for (const key of contractSummaryStringKeys) {
    const fieldValue = record[key];
    if (typeof fieldValue === "string") {
      summary[key] = fieldValue;
    }
  }
  return summary;
}

const contractSummaryStringKeys = [
  "kind",
  "id",
  "sourceName",
  "targetId",
  "metadataName",
] as const;
