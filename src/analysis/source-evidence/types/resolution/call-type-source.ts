import type { SourceFile } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { SourceCallableContract } from "../../../../target-model/records/callables/source-callable-contract.js";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import type { CsharpProjectTypePolicy } from "../../../../target-model/records/types/project-types.js";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../../target-model/types/model.js";
import { inferCsharpTargetTypeParameterBindings, substituteTargetTypeParameters } from "../../../../policy/types/resolution/substitution.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import { nextState } from "./state.js";
import type { CsharpSourceCallReceiverSource, CsharpSourceCallReceiverInput, CsharpSourceCallReceiverCompletion } from "./receiver-completions.js";
import type { CsharpSourceOwnedConstructionSource } from "./expression-source.js";

export interface CsharpSourceCallableTypeInput {
  readonly source: ResolvedSourceCallInfo;
  readonly callable: SourceCallableContract;
  readonly type: TargetTypeRef;
  readonly sourceFile: SourceFile;
  readonly state: CsharpTypeResolutionState;
  readonly excludedSourceArgumentIndexes: ReadonlySet<number> | undefined;
  readonly construction: CsharpSourceOwnedConstructionSource | undefined;
  readonly receiverSource: CsharpSourceCallReceiverSource;
}

type Instantiation = NonNullable<ReturnType<CsharpTypeResolutionScope["resolveSourceCallInstantiation"]>>;
type ReceiverInstantiation = ReturnType<CsharpProjectTypePolicy["instantiateDeclarationType"]>;

export type CsharpSourceCallableTypeRequest = {
  readonly input: CsharpSourceCallableTypeInput;
} & (
  | { readonly kind: "instantiation"; readonly state: CsharpTypeResolutionState }
  | { readonly kind: "receiver"; readonly instantiation: Instantiation; readonly substituted: TargetTypeRef;
      readonly receiverInput: CsharpSourceCallReceiverInput }
  | { readonly kind: "declaration"; readonly instantiation: Instantiation; readonly substituted: TargetTypeRef;
      readonly receiverType: TargetTypeRef | undefined }
  | { readonly kind: "shape"; readonly instantiation: Instantiation; readonly substituted: TargetTypeRef;
      readonly receiverType: TargetTypeRef }
);

export type CsharpCompletedSourceCallableTypeRequest = {
  readonly request: CsharpSourceCallableTypeRequest;
} & (
  | { readonly kind: "instantiation"; readonly instantiation: Instantiation | undefined }
  | { readonly kind: "receiver"; readonly completion: CsharpSourceCallReceiverCompletion | undefined }
  | { readonly kind: "declaration"; readonly result: ReceiverInstantiation }
  | { readonly kind: "shape"; readonly shape: CsharpObjectShapeFact | undefined }
);

export interface CsharpSourceCallableTypeCompletion {
  readonly input: CsharpSourceCallableTypeInput;
  readonly instantiation: Instantiation;
  readonly substituted: TargetTypeRef;
  readonly receiverType: TargetTypeRef | undefined;
  readonly receiver: CsharpSourceCallReceiverCompletion | undefined;
  readonly receiverInstantiation: ReceiverInstantiation;
  readonly shape: CsharpObjectShapeFact | undefined;
  readonly receiverBindings: ReadonlyMap<string, TargetTypeRef> | undefined;
  readonly type: TargetTypeRef;
}

export function* completeCsharpSourceCallableTypeSource(
  input: CsharpSourceCallableTypeInput,
): Generator<CsharpSourceCallableTypeRequest, CsharpSourceCallableTypeCompletion | undefined,
  CsharpCompletedSourceCallableTypeRequest> {
  if (input.receiverSource === undefined || input.receiverSource.source !== input.source ||
      input.receiverSource.queries.sourceFile !== input.sourceFile ||
      input.receiverSource.selected.receiver !== input.source.sourceReceiver ||
      input.receiverSource.selected.queries !== input.receiverSource.queries) return failTargetAnalysisInvariant("tsonic-csharp",
    "Callable type completion requires its exact retained Source receiver.", input.source.call);
  const instantiationRequest = Object.freeze({ kind: "instantiation" as const, input, state: nextState(input.state) });
  const instantiated = yield instantiationRequest;
  if (instantiated.request !== instantiationRequest || instantiated.kind !== "instantiation") {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "Callable type completion requires its exact instantiation dependency.", input.source.call);
  }
  const instantiation = instantiated.instantiation;
  if (instantiation === undefined) return undefined;
  const substituted = substituteTargetTypeParameters(input.type, instantiation.substitutions);
  const receiverInput = Object.freeze({ source: input.source, sourceFile: input.sourceFile, state: input.state,
    construction: input.construction, receiverSource: input.receiverSource });
  const receiverRequest = Object.freeze({ kind: "receiver" as const, input, instantiation, substituted, receiverInput });
  const completedReceiver = yield receiverRequest;
  if (completedReceiver.request !== receiverRequest || completedReceiver.kind !== "receiver") {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "Callable type completion requires its exact receiver dependency.", input.source.call);
  }
  const receiver = completedReceiver.completion;
  if (receiver !== undefined && receiver.input !== receiverInput) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "Callable type completion requires its exact retained receiver input.", input.source.call);
  }
  const receiverType = receiver?.type;
  let receiverInstantiation: ReceiverInstantiation = { kind: "not-project-member" };
  if (input.callable.nativeSignature.receiverTypeOwner !== undefined) {
    const declarationRequest = Object.freeze({ kind: "declaration" as const, input, instantiation, substituted, receiverType });
    const declaration = yield declarationRequest;
    if (declaration.request !== declarationRequest || declaration.kind !== "declaration") {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "Callable type completion requires its exact declaration dependency.", input.source.call);
    }
    receiverInstantiation = declaration.result;
  }
  if (receiverInstantiation.kind === "unresolved") return undefined;
  if (receiverInstantiation.kind === "resolved") {
    return Object.freeze({ input, instantiation, substituted, receiverType, receiver, receiverInstantiation,
      shape: undefined, receiverBindings: undefined, type: receiverInstantiation.type });
  }
  let shape: CsharpObjectShapeFact | undefined;
  if (receiverType !== undefined) {
    const shapeRequest = Object.freeze({ kind: "shape" as const, input, instantiation, substituted, receiverType });
    const selected = yield shapeRequest;
    if (selected.request !== shapeRequest || selected.kind !== "shape") {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "Callable type completion requires its exact receiver shape dependency.", input.source.call);
    }
    shape = selected.shape;
  }
  const template = shape?.declarationTemplate?.targetType;
  if (template?.kind !== "target-named" || receiverType === undefined) {
    return Object.freeze({ input, instantiation, substituted, receiverType, receiver, receiverInstantiation,
      shape, receiverBindings: undefined, type: substituted });
  }
  const names = new Set((template.typeArguments ?? []).flatMap(argument =>
    argument.kind === "type-parameter" ? [argument.identity] : []));
  const receiverBindings = inferCsharpTargetTypeParameterBindings(template, receiverType, names);
  if (receiverBindings === undefined) return undefined;
  const type = substituteTargetTypeParameters(substituted, receiverBindings);
  return Object.freeze({ input, instantiation, substituted, receiverType, receiver, receiverInstantiation, shape, receiverBindings, type });
}
