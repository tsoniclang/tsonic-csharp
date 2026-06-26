import {
  argumentPassingFactKey,
} from "@tsonic/tsts";
import type {
  ArgumentPassingFact,
  ArgumentPassingMode,
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetParameter,
} from "@tsonic/tsts";

export function getEffectiveArgumentForTargetParameter(
  parameter: TargetParameter,
  argument: ExtensionFactSubject,
  context: ExtensionObservationContext,
): { readonly subject: ExtensionFactSubject; readonly passing?: ArgumentPassingFact } | undefined {
  const passing = getArgumentPassingFact(argument, context);
  if (parameter.passingMode === "by-value") {
    return passing === undefined
      ? { subject: argument }
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
