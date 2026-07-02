import {
  argumentPassingFactKey,
} from "@tsonic/tsts";
import type {
  ArgumentPassingFact,
  ArgumentPassingMode,
  ExtensionFactSubject,
  ExtensionObservationContext,
  ProviderDeclarationIdentity,
  TargetParameter,
} from "@tsonic/tsts";
import {
  targetTypeRefEquals,
} from "../target-ref-utils.js";

export function getEffectiveArgumentForTargetParameter(
  parameter: TargetParameter,
  argument: ExtensionFactSubject,
  context: ExtensionObservationContext,
  options: {
    readonly parameterIndex?: number;
    readonly selectedProviderDeclaration?: ProviderDeclarationIdentity;
  } = {},
): { readonly subject: ExtensionFactSubject; readonly passing?: ArgumentPassingFact } | undefined {
  const passing = getArgumentPassingFact(argument, context);
  if (passing !== undefined && !argumentPassingFactMatchesTargetParameter(parameter, passing, options)) {
    return undefined;
  }
  if (parameter.passingMode === "by-value") {
    return passing === undefined
      ? { subject: argument }
      : passing.mode === "by-value"
        ? { subject: passing.targetExpression ?? argument, passing }
        : undefined;
  }
  if (passing === undefined || !argumentPassingModeMatchesTargetParameter(parameter.passingMode, passing.mode)) {
    return undefined;
  }
  return passing.targetExpression === undefined
    ? undefined
    : {
        subject: passing.targetExpression,
        passing,
      };
}

export function targetParameterPassingModeIsValid(mode: unknown): mode is ArgumentPassingMode {
  switch (mode) {
    case "by-value":
    case "byref-writeonly-must-init":
    case "byref-readwrite":
    case "byref-readonly":
      return true;
    default:
      return false;
  }
}

function getArgumentPassingFact(
  argument: ExtensionFactSubject,
  context: ExtensionObservationContext,
): ArgumentPassingFact | undefined {
  const factContext = context as {
    readonly factResolver?: ExtensionObservationContext["factResolver"];
    readonly facts?: ExtensionObservationContext["facts"];
  };
  return factContext.factResolver?.resolve(argument, argumentPassingFactKey) ??
    factContext.facts?.get(argument, argumentPassingFactKey);
}

function argumentPassingModeMatchesTargetParameter(expected: ArgumentPassingMode, actual: ArgumentPassingMode): boolean {
  return expected === actual;
}

function argumentPassingFactMatchesTargetParameter(
  parameter: TargetParameter,
  passing: ArgumentPassingFact,
  options: {
    readonly parameterIndex?: number;
    readonly selectedProviderDeclaration?: ProviderDeclarationIdentity;
  },
): boolean {
  if (passing.parameterIndex !== undefined && options.parameterIndex !== undefined && passing.parameterIndex !== options.parameterIndex) {
    return false;
  }
  if (
    passing.selectedSignature !== undefined &&
    options.selectedProviderDeclaration !== undefined &&
    !providerDeclarationIdentitiesMatch(options.selectedProviderDeclaration, passing.selectedSignature)
  ) {
    return false;
  }
  if (
    passing.targetParameter !== undefined &&
    !targetParameterFactsMatch(parameter, passing.targetParameter) &&
    !byValueSelectedSignatureParameterFactsAreCompatible(parameter, passing, options)
  ) {
    return false;
  }
  return true;
}

function byValueSelectedSignatureParameterFactsAreCompatible(
  parameter: TargetParameter,
  passing: ArgumentPassingFact,
  options: {
    readonly selectedProviderDeclaration?: ProviderDeclarationIdentity;
  },
): boolean {
  return parameter.passingMode === "by-value" &&
    passing.mode === "by-value" &&
    passing.selectedSignature !== undefined &&
    options.selectedProviderDeclaration !== undefined &&
    providerDeclarationIdentitiesMatch(options.selectedProviderDeclaration, passing.selectedSignature) &&
    passing.targetParameter !== undefined &&
    passing.targetParameter.passingMode === "by-value" &&
    passing.targetParameter.optional === parameter.optional &&
    passing.targetParameter.paramsArray === parameter.paramsArray;
}

function providerDeclarationIdentitiesMatch(
  expected: ProviderDeclarationIdentity,
  actual: ProviderDeclarationIdentity,
): boolean {
  return expected.providerId === actual.providerId &&
    expected.providerVersion === actual.providerVersion &&
    expected.providerModuleId === actual.providerModuleId &&
    expected.moduleSpecifier === actual.moduleSpecifier &&
    expected.virtualFileName === actual.virtualFileName &&
    expected.exportName === actual.exportName &&
    expected.exportId === actual.exportId &&
    expected.memberName === actual.memberName &&
    expected.memberId === actual.memberId &&
    expected.signatureId === actual.signatureId &&
    optionalTargetTypeRefEquals(expected.targetIdentity, actual.targetIdentity);
}

function targetParameterFactsMatch(expected: TargetParameter, actual: TargetParameter): boolean {
  return expected.name === actual.name &&
    expected.passingMode === actual.passingMode &&
    expected.optional === actual.optional &&
    expected.paramsArray === actual.paramsArray &&
    targetTypeRefEquals(expected.type, actual.type);
}

function optionalTargetTypeRefEquals(
  expected: ProviderDeclarationIdentity["targetIdentity"],
  actual: ProviderDeclarationIdentity["targetIdentity"],
): boolean {
  if (expected === undefined || actual === undefined) {
    return expected === actual;
  }
  return targetTypeRefEquals(expected, actual);
}
