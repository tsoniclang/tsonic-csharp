import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpLiteralContext, CsharpLiteralCreationSelection,
  CsharpLiteralCreationSource } from "../../../objects/literal-creation-source.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import type { CsharpSourceCallContractSource } from "./call-contracts.js";
import { completeCsharpSourceCallArgumentParameter } from "./call-api.js";
import type { CsharpStructuralTypeSourceInput } from "./root-sources.js";
import type { CsharpTypeResolutionScope } from "./scope.js";

export type CsharpLiteralCreationContextInput = {
  readonly context: CsharpLiteralContext;
} & (
  | { readonly kind: "argument"; readonly contract: CsharpSourceCallContractSource }
  | { readonly kind: "component"; readonly source: CsharpStructuralTypeSourceInput }
);

export type CsharpLiteralCreationContextDependency =
  | { readonly kind: "argument"; readonly context: CsharpLiteralContext;
      readonly argument: NonNullable<CsharpLiteralContext["argument"]>;
      readonly contract: CsharpSourceCallContractSource }
  | { readonly kind: "component"; readonly context: CsharpLiteralContext;
      readonly source: CsharpStructuralTypeSourceInput };

export interface CsharpLiteralCreationContextSource {
  readonly creation: CsharpLiteralCreationSource;
  readonly context: CsharpLiteralCreationSelection | undefined;
  readonly dependencies: readonly CsharpLiteralCreationContextDependency[];
}

export interface CsharpLiteralCreationContextTarget {
  readonly source: CsharpLiteralCreationContextSource;
  readonly context: CsharpLiteralCreationSelection;
  readonly destinationType: TargetTypeRef;
}

export interface CsharpCompletedLiteralCreationContext {
  readonly request: CsharpLiteralCreationContextDependency;
  readonly type: TargetTypeRef | undefined;
}

export function formCsharpLiteralCreationContextSource(
  creation: CsharpLiteralCreationSource,
  context: CsharpLiteralCreationSelection | undefined,
  inputs: readonly CsharpLiteralCreationContextInput[],
): CsharpLiteralCreationContextSource {
  if (context !== undefined && context.creation !== creation) return failTargetAnalysisInvariant("tsonic-csharp",
    "Literal completion requires the canonical selection from its exact source occurrence.", creation.expression);
  if (inputs.length !== creation.contexts.length || inputs.some((input, index) => input.context !== creation.contexts[index])) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "Literal context completion requires every ordered original source context.", creation.expression);
  }
  const dependencies = inputs.map((input): CsharpLiteralCreationContextDependency => {
    const argument = input.context.argument;
    if (input.kind === "argument") {
      if (argument === undefined || input.contract.source !== argument.source ||
        input.contract.callableSource.source !== argument.source ||
        input.contract.callableSource.sourceFile !== input.contract.sourceFile) {
        return failTargetAnalysisInvariant("tsonic-csharp",
          "Literal argument completion requires its exact checked call source.", creation.expression);
      }
      return Object.freeze({ kind: "argument", context: input.context, argument, contract: input.contract });
    }
    if (argument !== undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "An argument context cannot substitute a checked component for its native formal.", creation.expression);
    return Object.freeze({ kind: "component", context: input.context, source: input.source });
  });
  return Object.freeze({ creation, context, dependencies: Object.freeze(dependencies) });
}

export function* completeCsharpLiteralCreationContextSource(
  source: CsharpLiteralCreationContextSource,
): Generator<CsharpLiteralCreationContextDependency, CsharpLiteralCreationContextTarget | undefined, CsharpCompletedLiteralCreationContext> {
  if (source.context === undefined) return undefined;
  const types: (TargetTypeRef | undefined)[] = [];
  for (const request of source.dependencies) {
    const completed = yield request;
    if (completed.request !== request) return failTargetAnalysisInvariant("tsonic-csharp",
      "Literal context completion requires its exact chosen native dependency.", source.creation.expression);
    types.push(completed.type);
  }
  const first = types[0];
  return first !== undefined && types.every(type => type !== undefined && targetTypeRefEquals(type, first))
    ? Object.freeze({ source, context: source.context, destinationType: first }) : undefined;
}

export function resolveFormedCsharpLiteralCreationContext(
  scope: CsharpTypeResolutionScope,
  source: CsharpLiteralCreationContextSource,
): CsharpLiteralCreationContextTarget | undefined {
  const completion = completeCsharpLiteralCreationContextSource(source);
  let step = completion.next();
  while (!step.done) {
    const request = step.value;
    const type = request.kind === "argument"
      ? completeCsharpSourceCallArgumentParameter(scope, request.contract,
          request.argument.correspondence.binding, request.argument.excludedSourceArgumentIndexes)
      : scope.host.structuralTypes.completeTypeSource(request.source);
    step = completion.next(Object.freeze({ request, type }));
  }
  return step.value;
}
