import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpLiteralContext, CsharpLiteralCreationSelection,
  CsharpLiteralCreationSource } from "../../../objects/literal-creation-source.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { getCsharpCallableValueSignature, getCsharpTaskResultTargetType } from "../../../../target-model/types/carriers/delegates.js";
import type { CsharpSourceCallContractSource } from "./call-contracts.js";
import { completeCsharpSourceCallArgumentParameter } from "./call-api.js";
import type { CsharpSourceCallArgumentParameterCompletion } from "./call-argument-source.js";
import type { CsharpStructuralTypeSourceInput } from "./root-sources.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpSourceOwnedConstructionSource } from "./expression-source.js";

export type CsharpLiteralCreationContextInput = {
  readonly context: CsharpLiteralContext;
} & (
  | { readonly kind: "argument"; readonly contract: CsharpSourceCallContractSource;
      readonly construction: CsharpSourceOwnedConstructionSource | undefined; readonly asynchronous: boolean }
  | { readonly kind: "component"; readonly source: CsharpStructuralTypeSourceInput }
  | { readonly kind: "unavailable"; readonly selectedType: undefined }
);

export type CsharpLiteralCreationContextDependency =
  | { readonly kind: "argument"; readonly context: CsharpLiteralContext;
      readonly argument: NonNullable<CsharpLiteralContext["argument"]>;
      readonly contract: CsharpSourceCallContractSource;
      readonly construction: CsharpSourceOwnedConstructionSource | undefined; readonly asynchronous: boolean }
  | { readonly kind: "component"; readonly context: CsharpLiteralContext;
      readonly source: CsharpStructuralTypeSourceInput }
  | { readonly kind: "unavailable"; readonly context: CsharpLiteralContext; readonly selectedType: undefined };

export interface CsharpLiteralCreationContextSource {
  readonly creation: CsharpLiteralCreationSource;
  readonly context: CsharpLiteralCreationSelection | undefined;
  readonly dependencies: readonly CsharpLiteralCreationContextDependency[];
}

export interface CsharpLiteralCreationContextTarget {
  readonly source: CsharpLiteralCreationContextSource;
  readonly context: CsharpLiteralCreationSelection;
  readonly destinationType: TargetTypeRef;
  readonly completions: readonly CsharpCompletedLiteralCreationContext[];
}

export interface CsharpCompletedLiteralCreationContext {
  readonly request: CsharpLiteralCreationContextDependency;
  readonly type: TargetTypeRef | undefined;
  readonly argument: CsharpSourceCallArgumentParameterCompletion | undefined;
}

export function formCsharpLiteralCreationContextSource(
  creation: CsharpLiteralCreationSource,
  context: CsharpLiteralCreationSelection | undefined,
  inputs: readonly CsharpLiteralCreationContextInput[],
): CsharpLiteralCreationContextSource {
  if (context !== undefined && context.creation !== creation) return failTargetAnalysisInvariant("tsonic-csharp",
    "Literal completion requires the canonical selection from its exact source occurrence.", creation.expression);
  if (inputs.length !== creation.contexts.length || creation.contexts.some((original, index) => inputs[index]?.context !== original)) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "Literal context completion requires every ordered original source context.", creation.expression);
  }
  const dependencies = inputs.map((input): CsharpLiteralCreationContextDependency => {
    const argument = input.context.argument;
    if (input.kind === "argument") {
      if (argument === undefined || input.asynchronous && input.context.returnedFrom === undefined ||
        input.contract.source !== argument.source ||
        input.contract.callableSource.source !== argument.source ||
        input.contract.callableSource.sourceFile !== input.contract.sourceFile ||
        input.construction !== undefined && input.construction.contract !== input.contract) {
        return failTargetAnalysisInvariant("tsonic-csharp",
          "Literal argument completion requires its exact checked call source.", creation.expression);
      }
      return Object.freeze({ kind: "argument", context: input.context, argument, contract: input.contract,
        construction: input.construction, asynchronous: input.asynchronous });
    }
    if (argument !== undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "An argument context cannot substitute a checked component for its native formal.", creation.expression);
    if (input.kind === "unavailable") return Object.freeze({ kind: "unavailable", context: input.context,
      selectedType: input.selectedType });
    return Object.freeze({ kind: "component", context: input.context, source: input.source });
  });
  return Object.freeze({ creation, context, dependencies: Object.freeze(dependencies) });
}

export function* completeCsharpLiteralCreationContextSource(
  source: CsharpLiteralCreationContextSource,
): Generator<CsharpLiteralCreationContextDependency, CsharpLiteralCreationContextTarget | undefined, CsharpCompletedLiteralCreationContext> {
  if (source.context === undefined) return undefined;
  const completions: CsharpCompletedLiteralCreationContext[] = [];
  for (const request of source.dependencies) {
    const completed = yield request;
    if (completed.request !== request) return failTargetAnalysisInvariant("tsonic-csharp",
      "Literal context completion requires its exact chosen native dependency.", source.creation.expression);
    const association = completed.argument?.association;
    const argumentMatches = request.kind === "argument"
      ? association === undefined ? completed.type === undefined : association.source === request.contract &&
        association.binding === request.argument.correspondence.binding &&
        association.construction === request.construction &&
        association.excludedSourceArgumentIndexes === request.argument.excludedSourceArgumentIndexes
      : completed.argument === undefined;
    if (!argumentMatches) return failTargetAnalysisInvariant("tsonic-csharp",
      "Literal context completion requires its exact retained argument association.", source.creation.expression);
    completions.push(completed);
  }
  const first = completions[0]?.type;
  return first !== undefined && completions.every(completed => completed.type !== undefined && targetTypeRefEquals(completed.type, first))
    ? Object.freeze({ source, context: source.context, destinationType: first, completions: Object.freeze(completions) }) : undefined;
}

export function resolveFormedCsharpLiteralCreationContext(
  scope: CsharpTypeResolutionScope,
  source: CsharpLiteralCreationContextSource,
): CsharpLiteralCreationContextTarget | undefined {
  const completion = completeCsharpLiteralCreationContextSource(source);
  let step = completion.next();
  while (!step.done) {
    const request = step.value;
    let type: TargetTypeRef | undefined;
    let argument: CsharpSourceCallArgumentParameterCompletion | undefined;
    if (request.kind === "argument") {
      argument = completeCsharpSourceCallArgumentParameter(scope, request.contract,
        request.argument.correspondence.binding, request.construction, request.argument.excludedSourceArgumentIndexes);
      const parameter = argument?.type;
      const result = request.context.returnedFrom === undefined ? parameter
        : getCsharpCallableValueSignature(getCsharpNullableElementTargetType(parameter) ?? parameter)?.returnType;
      type = request.asynchronous ? getCsharpTaskResultTargetType(result) : result;
    } else if (request.kind === "component") type = scope.host.structuralTypes.completeTypeSource(request.source);
    step = completion.next(Object.freeze({ request, type, argument }));
  }
  return step.value;
}
