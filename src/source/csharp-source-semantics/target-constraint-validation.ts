import {
  acceptObservation,
  deferObservation,
  rejectObservation,
} from "@tsonic/tsts";
import type {
  ExtensionEvidence,
  ExtensionObservation,
  ExtensionObservationContext,
  SourcePrimitiveKind,
  TargetConstraint,
  TargetConstraintValidationRequest,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpProviderDiagnostic,
} from "./diagnostics.js";
import {
  csharpTargetId,
} from "./identity.js";
import type {
  CsharpOperationsProviderHost,
} from "./operations-provider.js";
import {
  csharpSourcePrimitiveDotnetMetadataName,
  getCsharpNullableElementTargetType,
} from "./target-types.js";
import {
  targetTypeRefEquals,
  targetTypeRefKey,
} from "./target-ref-utils.js";

type CsharpTargetConstraintValidation =
  | {
      readonly valid: true;
      readonly evidence: readonly ExtensionEvidence[];
    }
  | {
      readonly valid: false;
      readonly reason: string;
      readonly evidence: readonly ExtensionEvidence[];
    };

export function validateCsharpTargetConstraint(
  request: TargetConstraintValidationRequest,
  context: ExtensionObservationContext<"target.validateConstraint">,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<boolean> {
  if (request.target !== undefined && request.target !== csharpTargetId) {
    return deferObservation;
  }
  const source = host.getTargetTypeRefForSubject(request.source, context);
  const validation = validateCsharpTargetConstraintForType(source, request.constraint, host, new Set());
  if (validation.valid) {
    return acceptObservation(true, validation.evidence);
  }
  return rejectCsharpTargetConstraint(request, context, validation.reason, validation.evidence);
}

function validateCsharpTargetConstraintForType(
  source: TargetTypeRef | undefined,
  constraint: TargetConstraint,
  host: CsharpOperationsProviderHost,
  visited: Set<string>,
): CsharpTargetConstraintValidation {
  if (source === undefined) {
    return invalidConstraint(
      "C# target generic constraint requires a finalized target type fact for the selected source type argument.",
      [{ message: "Missing target type fact", details: constraint }],
    );
  }
  switch (constraint.kind) {
    case "value-type":
      return isCsharpValueType(source, host)
        ? validConstraint("C# target generic constraint proved a value-type target argument.", source, constraint)
        : invalidConstraint(`C# target generic constraint requires a value type, but received '${targetTypeRefKey(source)}'.`, constraintEvidence(source, constraint));
    case "reference-type":
      return isCsharpReferenceType(source, host)
        ? validConstraint("C# target generic constraint proved a reference-type target argument.", source, constraint)
        : invalidConstraint(`C# target generic constraint requires a reference type, but received '${targetTypeRefKey(source)}'.`, constraintEvidence(source, constraint));
    case "constructible":
      return hasCsharpPublicParameterlessConstruction(source, host)
        ? validConstraint("C# target generic constraint proved a parameterless construction path.", source, constraint)
        : invalidConstraint(`C# target generic constraint requires a public parameterless constructor, but no finalized provider fact proves one for '${targetTypeRefKey(source)}'.`, constraintEvidence(source, constraint));
    case "unmanaged":
      return isCsharpUnmanagedType(source, host)
        ? validConstraint("C# target generic constraint proved an unmanaged target argument.", source, constraint)
        : invalidConstraint(`C# target generic constraint requires an unmanaged type, but no finalized provider fact proves one for '${targetTypeRefKey(source)}'.`, constraintEvidence(source, constraint));
    case "implements":
      return implementsCsharpContract(source, constraint, host, visited)
        ? validConstraint("C# target generic constraint proved an implemented target contract.", source, constraint)
        : invalidConstraint(`C# target generic constraint requires '${constraint.contract}', but no finalized provider fact proves '${targetTypeRefKey(source)}' implements it.`, constraintEvidence(source, constraint));
    case "target-specific":
      if (constraint.target === csharpTargetId && constraint.name === "notnull") {
        return isCsharpNotNullType(source, host)
          ? validConstraint("C# target generic constraint proved a notnull target argument.", source, constraint)
          : invalidConstraint(`C# target generic constraint requires a non-null target argument, but no finalized provider fact proves '${targetTypeRefKey(source)}' is non-null.`, constraintEvidence(source, constraint));
      }
      if (constraint.target === csharpTargetId && constraint.name === "unsupported-constraint") {
        return invalidConstraint(
          "C# target generic constraint is unsupported by the C# target provider.",
          constraintEvidence(source, constraint),
        );
      }
      return invalidConstraint(
        `C# target-specific generic constraint '${constraint.target}:${constraint.name}' is not supported by the C# target provider.`,
        constraintEvidence(source, constraint),
      );
    case "copy":
    case "clone":
    case "default":
    case "sized":
    case "lifetime":
      return invalidConstraint(
        `C# target generic constraint '${constraint.kind}' is not a supported C# constraint kind.`,
        constraintEvidence(source, constraint),
      );
    default:
      return invalidConstraint(
        `C# target generic constraint '${(constraint as { readonly kind?: unknown }).kind ?? "<unknown>"}' is not supported by the C# target provider because it is not a recognized target-neutral constraint shape.`,
        constraintEvidence(source, constraint),
      );
  }
}

function isCsharpValueType(type: TargetTypeRef, host: CsharpOperationsProviderHost): boolean {
  if (type.kind === "source-primitive") {
    return true;
  }
  if (type.kind !== "target-named") {
    return false;
  }
  if ((type as { readonly csharpValueType?: true }).csharpValueType === true) {
    return true;
  }
  const binding = host.getCsharpTargetBindingByTargetId(type.id);
  return binding?.kind === "struct" || binding?.kind === "enum";
}

function isCsharpReferenceType(type: TargetTypeRef, host: CsharpOperationsProviderHost): boolean {
  if (type.kind === "array") {
    return true;
  }
  if (type.kind === "function-pointer") {
    return false;
  }
  if (type.kind !== "target-named") {
    return false;
  }
  if ((type as { readonly csharpSpecialType?: string }).csharpSpecialType === "string") {
    return true;
  }
  const sourceDeclarationKind = (type as { readonly csharpSourceDeclarationKind?: string }).csharpSourceDeclarationKind;
  if (sourceDeclarationKind === "class" || sourceDeclarationKind === "interface") {
    return true;
  }
  if (sourceDeclarationKind === "enum" || sourceDeclarationKind === "struct") {
    return false;
  }
  const binding = host.getCsharpTargetBindingByTargetId(type.id);
  return binding?.kind === "class" || binding?.kind === "interface" || binding?.kind === "delegate";
}

function hasCsharpPublicParameterlessConstruction(type: TargetTypeRef, host: CsharpOperationsProviderHost): boolean {
  if (isCsharpValueType(type, host)) {
    return true;
  }
  if (type.kind !== "target-named") {
    return false;
  }
  const binding = host.getCsharpTargetBindingByTargetId(type.id);
  return binding?.members?.some((member) =>
    member.kind === "constructor" &&
    member.parameters.length === 0
  ) ?? false;
}

function isCsharpUnmanagedType(type: TargetTypeRef, host: CsharpOperationsProviderHost): boolean {
  if (type.kind === "source-primitive") {
    return true;
  }
  if (type.kind !== "target-named") {
    return false;
  }
  const binding = host.getCsharpTargetBindingByTargetId(type.id);
  return binding?.kind === "struct" && (binding as { readonly csharpUnmanaged?: true }).csharpUnmanaged === true;
}

function isCsharpNotNullType(type: TargetTypeRef | undefined, host: CsharpOperationsProviderHost): boolean {
  if (type === undefined || getCsharpNullableElementTargetType(type) !== undefined) {
    return false;
  }
  return isCsharpValueType(type, host) || isCsharpReferenceType(type, host);
}

function implementsCsharpContract(
  source: TargetTypeRef,
  constraint: Extract<TargetConstraint, { readonly kind: "implements" }>,
  host: CsharpOperationsProviderHost,
  visited: Set<string>,
): boolean {
  if (source.kind === "source-primitive") {
    return primitiveImplementsCsharpContract(source.name, constraint, host);
  }
  if (source.kind !== "target-named") {
    return false;
  }
  const relationKey = `${targetTypeRefKey(source)}:${constraint.contract}`;
  if (visited.has(relationKey)) {
    return false;
  }
  visited.add(relationKey);
  const binding = host.getCsharpTargetBindingByTargetId(source.id);
  if (binding?.implementedContracts?.some((candidate) => implementedContractMatches(candidate, constraint)) === true) {
    return true;
  }
  const baseType = host.getBaseTargetTypeRef?.(source);
  return baseType === undefined ? false : implementsCsharpContract(baseType, constraint, host, visited);
}

function primitiveImplementsCsharpContract(
  primitive: SourcePrimitiveKind,
  constraint: Extract<TargetConstraint, { readonly kind: "implements" }>,
  host: CsharpOperationsProviderHost,
): boolean {
  const binding = host.getCsharpTargetBindingByMetadataName(csharpSourcePrimitiveDotnetMetadataName(primitive));
  return binding?.implementedContracts?.some((candidate) => implementedContractMatches(candidate, constraint)) === true;
}

function implementedContractMatches(
  candidate: TargetConstraint,
  expected: Extract<TargetConstraint, { readonly kind: "implements" }>,
): boolean {
  if (candidate.kind !== "implements" || candidate.contract !== expected.contract) {
    return false;
  }
  const candidateArguments = candidate.typeArguments ?? [];
  const expectedArguments = expected.typeArguments ?? [];
  return candidateArguments.length === expectedArguments.length &&
    candidateArguments.every((argument, index) => targetTypeRefEquals(argument, expectedArguments[index]!));
}

function validConstraint(message: string, source: TargetTypeRef, constraint: TargetConstraint): CsharpTargetConstraintValidation {
  return {
    valid: true,
    evidence: [
      { message, details: { source, constraint } },
    ],
  };
}

function invalidConstraint(reason: string, evidence: readonly ExtensionEvidence[]): CsharpTargetConstraintValidation {
  return {
    valid: false,
    reason,
    evidence,
  };
}

function constraintEvidence(source: TargetTypeRef, constraint: TargetConstraint): readonly ExtensionEvidence[] {
  return [
    { message: "C# target generic constraint", details: constraint },
    { message: "Selected target type argument", details: source },
  ];
}

function rejectCsharpTargetConstraint(
  request: TargetConstraintValidationRequest,
  context: ExtensionObservationContext<"target.validateConstraint">,
  message: string,
  evidence: readonly ExtensionEvidence[],
): ExtensionObservation<boolean> {
  return rejectObservation({
    ...targetConstraintDiagnostic(request.source, context, message, evidence),
  });
}

function targetConstraintDiagnostic(
  source: TargetConstraintValidationRequest["source"],
  context: ExtensionObservationContext<"target.validateConstraint">,
  message: string,
  evidence: readonly ExtensionEvidence[],
) {
  return {
    ...csharpProviderDiagnostic(
      context.extensionId,
      "CSHARP_TARGET_CONSTRAINT_INVALID",
      9100145,
      message,
    ),
    nodeOrSpan: source,
    evidence,
    identity: `csharp-target-constraint:${subjectIdentity(source)}`,
  };
}

function subjectIdentity(subject: unknown): string {
  if (subject !== null && typeof subject === "object" && "id" in subject) {
    return String((subject as { readonly id?: unknown }).id ?? "unknown");
  }
  return `${typeof subject}:${String(subject)}`;
}
