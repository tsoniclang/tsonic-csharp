import type {
  ProviderDeclarationModel,
  ProviderExportDeclaration,
  ProviderHeritageDeclaration,
  ProviderMemberDeclaration,
  ProviderParameterDeclaration,
  ProviderSignatureDeclaration,
  ProviderTypeExpression,
  ProviderTypeParameterDeclaration,
} from "@tsonic/tsts";
import type {
  DotnetConstraint,
  DotnetExportDeclaration,
  DotnetMemberDeclaration,
  DotnetModuleModel,
  DotnetParameterDeclaration,
  DotnetSignatureDeclaration,
  DotnetTypeDeclaration,
  DotnetTypeParameterDeclaration,
  DotnetTypeRef,
  DotnetUnsupportedConstraintDeclaration,
  DotnetUnsupportedExportDeclaration,
  DotnetUnsupportedMemberDeclaration,
} from "./model.js";
import type {
  DotnetProviderDiagnostic,
} from "./provider.js";

const supportedPassingModes = new Set([
  "by-value",
  "byref-readonly",
  "byref-readwrite",
  "byref-writeonly-must-init",
]);

export function validateDotnetModuleModelContract(module: DotnetModuleModel): DotnetProviderDiagnostic | undefined {
  const collector = createContractCollector("DOTNET_PROVIDER_MODEL_CONTRACT_INVALID", "Invalid .NET provider model contract.");
  requireNonEmptyString(module.moduleSpecifier, "$.moduleSpecifier", collector);
  requireNonEmptyString(module.namespaceName, "$.namespaceName", collector);
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
  switch (declaration.kind) {
    case "type":
      validateDotnetTypeDeclaration(declaration, path, collector, options);
      return;
    case "function":
      requireNonEmptyString(declaration.sourceName, `${path}.sourceName`, collector);
      requireNonEmptyString(declaration.targetId, `${path}.targetId`, collector);
      requireNonEmptyString(declaration.metadataName, `${path}.metadataName`, collector);
      validateDotnetSignatureList(declaration.signatures, `${path}.signatures`, collector, { requireReturnType: true });
      return;
    case "value":
      requireNonEmptyString(declaration.sourceName, `${path}.sourceName`, collector);
      requireNonEmptyString(declaration.targetId, `${path}.targetId`, collector);
      requireNonEmptyString(declaration.metadataName, `${path}.metadataName`, collector);
      validateDotnetTypeRef(declaration.type, `${path}.type`, collector, { allowLiteral: false, allowProviderRef: false });
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
  requireNonEmptyString(declaration.sourceName, `${path}.sourceName`, collector);
  requireNonEmptyString(declaration.namespaceName, `${path}.namespaceName`, collector);
  requireNonEmptyString(declaration.targetId, `${path}.targetId`, collector);
  requireNonEmptyString(declaration.metadataName, `${path}.metadataName`, collector);
  validateDotnetTypeParameters(declaration.typeParameters ?? [], `${path}.typeParameters`, collector);
  validateOptionalDotnetTypeRef(declaration.baseType, `${path}.baseType`, collector, { allowLiteral: false, allowProviderRef: true });
  validateDotnetConstraints(declaration.implementedContracts ?? [], `${path}.implementedContracts`, collector);
  validateUnsupportedConstraints(declaration.unsupportedImplementedContracts ?? [], `${path}.unsupportedImplementedContracts`, collector);
  validateDotnetMemberList(declaration.members ?? [], `${path}.members`, collector);
  validateUnsupportedMembers(declaration.unsupportedMembers ?? [], `${path}.unsupportedMembers`, collector);
  for (const [index, operator] of (declaration.conversionOperators ?? []).entries()) {
    const operatorPath = `${path}.conversionOperators[${index}]`;
    requireNonEmptyString(operator.id, `${operatorPath}.id`, collector);
    requireNonEmptyString(operator.metadataName, `${operatorPath}.metadataName`, collector);
    validateDotnetTypeRef(operator.sourceType, `${operatorPath}.sourceType`, collector, { allowLiteral: false, allowProviderRef: false });
    validateDotnetTypeRef(operator.targetType, `${operatorPath}.targetType`, collector, { allowLiteral: false, allowProviderRef: false });
  }
  validateOptionalDotnetTypeRef(declaration.sourceShape, `${path}.sourceShape`, collector, { allowLiteral: true, allowProviderRef: true });
  validateOptionalDotnetTypeRef(declaration.targetType, `${path}.targetType`, collector, { allowLiteral: false, allowProviderRef: false });
  if (options.sourceVisible && declaration.typeKind === "delegate" && declaration.sourceShape === undefined) {
    collector.add(`${path}.sourceShape`, "Source-visible delegate declarations must carry a source function shape or be moved to targetOnlyTypes/unsupportedExports.");
  }
}

function validateDotnetMemberList(
  members: readonly DotnetMemberDeclaration[],
  path: string,
  collector: ContractCollector,
): void {
  for (const [index, member] of members.entries()) {
    const memberPath = `${path}[${index}]`;
    requireNonEmptyString(member.sourceName, `${memberPath}.sourceName`, collector);
    requireNonEmptyString(member.targetName, `${memberPath}.targetName`, collector);
    requireNonEmptyString(member.targetId, `${memberPath}.targetId`, collector);
    requireNonEmptyString(member.metadataName, `${memberPath}.metadataName`, collector);
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
          validateDotnetTypeRef(member.type, `${memberPath}.type`, collector, { allowLiteral: false, allowProviderRef: false });
        }
        break;
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
      });
    }
    validateOptionalDotnetTypeRef(signature.targetReturnType, `${signaturePath}.targetReturnType`, collector, { allowLiteral: false, allowProviderRef: false });
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
    validateDotnetTypeRef(parameter.type, `${parameterPath}.type`, collector, { allowLiteral: false, allowProviderRef: false });
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
  }
}

function validateDotnetConstraints(
  constraints: readonly DotnetConstraint[],
  path: string,
  collector: ContractCollector,
): void {
  for (const [index, constraint] of constraints.entries()) {
    const constraintPath = `${path}[${index}]`;
    if (constraint.kind === "implements") {
      validateDotnetTypeRef(constraint.contract, `${constraintPath}.contract`, collector, { allowLiteral: false, allowProviderRef: false });
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
    requireNonEmptyString(constraint.targetId, `${constraintPath}.targetId`, collector);
    requireNonEmptyString(constraint.metadataName, `${constraintPath}.metadataName`, collector);
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
    requireNonEmptyString(member.sourceName, `${memberPath}.sourceName`, collector);
    requireNonEmptyString(member.targetName, `${memberPath}.targetName`, collector);
    requireNonEmptyString(member.targetId, `${memberPath}.targetId`, collector);
    requireNonEmptyString(member.metadataName, `${memberPath}.metadataName`, collector);
    requireNonEmptyString(member.reason, `${memberPath}.reason`, collector);
    requireUnique(memberIds, member.targetId, `${memberPath}.targetId`, collector);
  }
}

function validateUnsupportedExports(
  declarations: readonly DotnetUnsupportedExportDeclaration[],
  path: string,
  collector: ContractCollector,
): void {
  for (const [index, declaration] of declarations.entries()) {
    const declarationPath = `${path}[${index}]`;
    requireNonEmptyString(declaration.sourceName, `${declarationPath}.sourceName`, collector);
    requireNonEmptyString(declaration.reason, `${declarationPath}.reason`, collector);
    if (declaration.kind === "unsupported-type-export") {
      requireNonEmptyString(declaration.targetId, `${declarationPath}.targetId`, collector);
      requireNonEmptyString(declaration.metadataName, `${declarationPath}.metadataName`, collector);
    } else {
      if (declaration.metadataNames.length === 0) {
        collector.add(`${declarationPath}.metadataNames`, "Unsupported type-family exports must identify every rejected metadata name.");
      }
    }
  }
}

function validateOptionalDotnetTypeRef(
  type: DotnetTypeRef | undefined,
  path: string,
  collector: ContractCollector,
  options: { readonly allowLiteral: boolean; readonly allowProviderRef: boolean },
): void {
  if (type !== undefined) {
    validateDotnetTypeRef(type, path, collector, options);
  }
}

function validateDotnetTypeRef(
  type: DotnetTypeRef,
  path: string,
  collector: ContractCollector,
  options: { readonly allowLiteral: boolean; readonly allowProviderRef: boolean },
): void {
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
      requireNonEmptyString(type.targetId, `${path}.targetId`, collector);
      requireNonEmptyString(type.metadataName, `${path}.metadataName`, collector);
      validateDotnetTypeRefs(type.typeArguments ?? [], `${path}.typeArguments`, collector, options);
      validateOptionalDotnetTypeRef(type.sourceShape, `${path}.sourceShape`, collector, { allowLiteral: true, allowProviderRef: true });
      return;
    case "array":
      if (type.rank !== undefined && type.rank < 1) {
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

function validateDotnetTypeRefs(
  types: readonly DotnetTypeRef[],
  path: string,
  collector: ContractCollector,
  options: { readonly allowLiteral: boolean; readonly allowProviderRef: boolean },
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
      validateProviderParameter(parameter, `${signaturePath}.parameters[${parameterIndex}]`, collector);
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
): void {
  requireNonEmptyString(parameter.name, `${path}.name`, collector);
  validateProviderTypeExpression(parameter.type, `${path}.type`, collector);
  validateOptionalProviderTypeExpression(parameter.defaultType, `${path}.defaultType`, collector);
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
        validateProviderParameter(parameter, `${path}.parameters[${index}]`, collector);
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

function requireNonEmptyString(value: string | undefined, path: string, collector: ContractCollector): void {
  if (typeof value !== "string" || value.length === 0) {
    collector.add(path, "Expected a non-empty string.", value);
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
