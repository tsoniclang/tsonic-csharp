import { dotnetSignatureFields, requireNonEmptyString, requireSupportedDiscriminant, requireUnique, supportedDotnetConstraintKinds, supportedDotnetMemberKinds, supportedPassingModes, supportedTypeParameterVariance } from "./support.js";
import { validateDotnetAssemblyReference, validateDotnetTargetIdentity, validateOptionalDotnetAssemblyReference, validateOptionalDotnetParameterDefaultValue, validateOptionalDotnetUnsupportedDefaultValue } from "./dotnet-identities.js";
import { validateDotnetTypeRef, validateOptionalDotnetTypeRef } from "./dotnet-types.js";
import type {
  DotnetConstraint,
  DotnetParameterDeclaration,
  DotnetSignatureDeclaration,
  DotnetTypeParameterDeclaration,
  DotnetTypeRef,
  DotnetUnsupportedConstraintDeclaration,
  DotnetUnsupportedExportDeclaration,
  DotnetUnsupportedMemberDeclaration,
} from "../index.js";
import type { ContractCollector } from "./support.js";

export function validateDotnetSignatureList(
  signatures: readonly DotnetSignatureDeclaration[],
  path: string,
  collector: ContractCollector,
  options: { readonly requireReturnType: boolean },
): void {
  const signatureIds = new Set<string>();
  for (const [index, signature] of signatures.entries()) {
    const signaturePath = `${path}[${index}]`;
    validateDotnetSignatureFields(signature, signaturePath, collector);
    requireNonEmptyString(signature.id, `${signaturePath}.id`, collector);
    requireUnique(signatureIds, signature.id, `${signaturePath}.id`, collector);
    requireNonEmptyString(signature.sourceId, `${signaturePath}.sourceId`, collector);
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
    validateDotnetTargetInvocation(
      signature.targetInvocation,
      signature,
      signaturePath,
      collector,
    );
  }
}
function validateDotnetSignatureFields(
  signature: DotnetSignatureDeclaration,
  path: string,
  collector: ContractCollector,
): void {
  const record = signature as unknown as Readonly<Record<string, unknown>>;
  for (const key of Object.keys(record)) {
    if (!dotnetSignatureFields.has(key)) {
      collector.add(
        `${path}.${key}`,
        "Field is not valid for a .NET signature declaration.",
        record[key],
      );
    }
  }
}
function validateDotnetTargetInvocation(
  invocation: DotnetSignatureDeclaration["targetInvocation"],
  signature: DotnetSignatureDeclaration,
  path: string,
  collector: ContractCollector,
): void {
  if (invocation === undefined) {
    return;
  }
  switch (invocation.kind) {
    case "array-creation": {
      if (
        !Number.isSafeInteger(invocation.lengthParameterIndex) ||
        invocation.lengthParameterIndex < 0 ||
        invocation.lengthParameterIndex >= signature.parameters.length
      ) {
        collector.add(
          `${path}.targetInvocation.lengthParameterIndex`,
          "Array-creation invocation lengthParameterIndex must identify an existing signature parameter.",
          invocation.lengthParameterIndex,
        );
      }
      const targetReturnType = signature.targetReturnType ?? signature.returnType;
      if (targetReturnType?.kind !== "array") {
        collector.add(
          `${path}.targetInvocation`,
          "Array-creation invocation must carry an array target return type.",
          invocation,
        );
      }
      return;
    }
    case "static-factory-construction":
      validateDotnetTypeRef(
        invocation.factoryType,
        `${path}.targetInvocation.factoryType`,
        collector,
        {
          allowLiteral: false,
          allowProviderRef: false,
          targetPosition: true,
        },
      );
      return;
  }
}

export function validateDotnetParameters(
  parameters: readonly DotnetParameterDeclaration[],
  path: string,
  collector: ContractCollector,
): void {
  for (const [index, parameter] of parameters.entries()) {
    const parameterPath = `${path}[${index}]`;
    requireNonEmptyString(parameter.name, `${parameterPath}.name`, collector);
    validateDotnetTypeRef(parameter.type, `${parameterPath}.type`, collector, { allowLiteral: false, allowProviderRef: false, targetPosition: true });
    validateOptionalDotnetTypeRef(parameter.sourceType, `${parameterPath}.sourceType`, collector, { allowLiteral: true, allowProviderRef: true });
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
      if (dotnetParamsArrayTargetType(parameter.type).kind !== "array") {
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

function dotnetParamsArrayTargetType(type: DotnetTypeRef): DotnetTypeRef {
  return type.kind === "nullable-reference"
    ? type.elementType
    : type;
}

export function validateDotnetTypeParameters(
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

export function validateDotnetConstraints(
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

export function validateUnsupportedConstraints(
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

export function validateUnsupportedMembers(
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

export function validateUnsupportedExports(
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
