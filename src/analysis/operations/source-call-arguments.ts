import type { SourceApplication } from "@tsonic/target-api/source";
import { selectCsharpSourceArgumentGrouping } from "../../policy/operations/members/source-argument-groups.js";
import type { CsharpSourceCallArgumentClassification } from "../../target-model/records/operations/operations.js";
import type { CsharpTargetCallSelection } from "../../target-model/records/operations/member-selections.js";
import { csharpSourceArgumentExpectedType } from "../../target-model/types/member-facts.js";
import type { CsharpTypedLocationOperationSelection } from "../../target-model/records/storage/typed-locations.js";
import type { CsharpSourceCallableApplication } from "../../target-model/records/callables/native-application.js";
import { csharpSourceCallableParameters } from "../callables/calls/native-application.js";

export function classifyCsharpTypedLocationCallArguments(
  source: SourceApplication,
  typedLocation: Extract<CsharpTypedLocationOperationSelection,
    { readonly kind: "location-bind" | "location-project" | "location-view" }>,
): Pick<CsharpSourceCallArgumentClassification, "sourceArgumentParameterTypes"> {
  return Object.freeze({ sourceArgumentParameterTypes: Object.freeze(source.arguments.map(binding => {
    const operand = source.sourceArguments[binding.sourceArgumentIndex]?.operand;
    if (operand?.kind !== "resolved") return undefined;
    const arguments_ = typedLocation.arguments.filter(argument => argument.expression === operand.value.occurrence);
    return binding.sourceForm === "value" && arguments_.length === 1 ? arguments_[0]!.type : undefined;
  })) });
}

export function classifyCsharpNativeCallArguments(
  source: SourceApplication,
  native: Extract<CsharpTargetCallSelection, { readonly kind: "resolved" }>,
): Pick<CsharpSourceCallArgumentClassification, "sourceArgumentParameterTypes"> {
  return Object.freeze({ sourceArgumentParameterTypes: Object.freeze(source.arguments.map(binding => {
    const arguments_ = native.call.arguments.filter(argument =>
      argument.sourceArgumentIndex === binding.sourceArgumentIndex &&
      argument.effectiveArgumentIndex === binding.effectiveArgumentIndex &&
      argument.sourceForm === binding.sourceForm && argument.spreadElementIndex === binding.spreadElementIndex);
    return arguments_.length === 1
      ? csharpSourceArgumentExpectedType(arguments_[0]!.targetParameter, binding.sourceForm) : undefined;
  })) });
}

export function classifyCsharpSourceCallArguments(
  source: SourceApplication,
  application: CsharpSourceCallableApplication,
): Pick<CsharpSourceCallArgumentClassification,
  "callableApplication" | "sourceParameterTypes" | "sourceArgumentParameterTypes" | "sourceArgumentGrouping"> {
  if (application.identity !== source.identity) {
    throw new TypeError("A physical callable binding requires the identical original Source application.");
  }
  const parameters = csharpSourceCallableParameters(application);
  const grouping = selectCsharpSourceArgumentGrouping(source, parameters);
  const parameterTypes = grouping.kind === "grouped"
    ? grouping.arguments.map(entry => entry.type) : source.arguments.map(() => undefined);
  return Object.freeze({
    callableApplication: application,
    sourceParameterTypes: Object.freeze(parameters.map(parameter => parameter.type)),
    sourceArgumentParameterTypes: Object.freeze(parameterTypes),
    sourceArgumentGrouping: grouping,
  });
}
