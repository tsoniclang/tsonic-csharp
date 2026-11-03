import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import type { SourceCallableContract } from "../../../../target-model/records/callables/source-callable-contract.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpTargetParameterValueType } from "../../../../target-model/types/member-facts.js";
import { csharpSourceCallArgumentParameter } from "../../../../policy/types/callables/source-callable-contract.js";
import type { CsharpSourceCallContractSelection, CsharpSourceCallContractSource } from "./call-contracts.js";
import type { CsharpTypeResolutionState } from "./model.js";

type SelectedContract = Exclude<CsharpSourceCallContractSelection, { readonly kind: "rejected" }>;
type NativeParameter = NonNullable<ReturnType<typeof csharpSourceCallArgumentParameter>>;

export interface CsharpSourceCallArgumentAssociation {
  readonly source: CsharpSourceCallContractSource;
  readonly binding: ResolvedSourceCallInfo["sourceArgumentBindings"][number];
  readonly checkedParameter: ResolvedSourceCallInfo["sourceSelectedSignatureParameters"][number];
  readonly excludedSourceArgumentIndexes: ReadonlySet<number> | undefined;
}

export type CsharpSourceCallArgumentParameterRequest = {
  readonly association: CsharpSourceCallArgumentAssociation;
} & (
  | { readonly kind: "contract"; readonly state: CsharpTypeResolutionState }
  | { readonly kind: "parameters"; readonly selection: SelectedContract; readonly callable: SourceCallableContract }
  | { readonly kind: "contracted"; readonly selection: SelectedContract; readonly callable: SourceCallableContract;
      readonly parameter: NativeParameter; readonly state: CsharpTypeResolutionState }
  | { readonly kind: "checked"; readonly selection: SelectedContract; readonly state: CsharpTypeResolutionState }
);

export type CsharpCompletedSourceCallArgumentParameterRequest = {
  readonly request: CsharpSourceCallArgumentParameterRequest;
} & (
  | { readonly kind: "contract"; readonly selection: CsharpSourceCallContractSelection }
  | { readonly kind: "parameters"; readonly matches: boolean }
  | { readonly kind: "contracted" | "checked"; readonly type: TargetTypeRef | undefined }
);

export type CsharpSourceCallArgumentParameterCompletion = {
  readonly association: CsharpSourceCallArgumentAssociation;
  readonly selection: SelectedContract;
  readonly type: TargetTypeRef;
} & (
  | { readonly kind: "contracted"; readonly parameter: NativeParameter }
  | { readonly kind: "checked" }
);

export function* completeCsharpSourceCallArgumentParameterSource(
  input: CsharpSourceCallContractSource,
  binding: ResolvedSourceCallInfo["sourceArgumentBindings"][number],
  excludedSourceArgumentIndexes?: ReadonlySet<number>,
): Generator<CsharpSourceCallArgumentParameterRequest, CsharpSourceCallArgumentParameterCompletion | undefined,
  CsharpCompletedSourceCallArgumentParameterRequest> {
  const parameter = input.source.sourceSelectedSignatureParameters[binding.sourceParameterIndex];
  if (parameter === undefined) return undefined;
  const association = Object.freeze({ source: input, binding, checkedParameter: parameter, excludedSourceArgumentIndexes });
  const contractRequest = Object.freeze({ kind: "contract" as const, association, state: Object.freeze({ depth: 0 }) });
  const selected = yield contractRequest;
  if (selected.request !== contractRequest || selected.kind !== "contract") return failTargetAnalysisInvariant("tsonic-csharp",
    "Argument completion requires its exact selected contract dependency.", input.source.call);
  if (selected.selection.kind === "rejected") return undefined;
  const selection = selected.selection;
  const callable = selection.contract;
  const contractedParameter = callable === undefined ? undefined : csharpSourceCallArgumentParameter(callable, binding.effectiveArgumentIndex);
  if (callable !== undefined && contractedParameter !== undefined) {
    if (selection.kind === "value" && contractedParameter.sourceParameter !== parameter.parameterDeclaration &&
      !(callable.kind === "source" && callable.bodyInputs?.parameters.some(slot => slot.sourceParameter === parameter.parameterDeclaration))) {
      return undefined;
    }
    const parametersRequest = Object.freeze({ kind: "parameters" as const, association, selection, callable });
    const parameters = yield parametersRequest;
    if (parameters.request !== parametersRequest || parameters.kind !== "parameters") return failTargetAnalysisInvariant("tsonic-csharp",
      "Argument completion requires its exact checked parameter dependency.", input.source.call);
    if (!parameters.matches) return undefined;
    const typeRequest = Object.freeze({ kind: "contracted" as const, association, selection, callable,
      parameter: contractedParameter, state: Object.freeze({ depth: 0 }) });
    const completed = yield typeRequest;
    if (completed.request !== typeRequest || completed.kind !== "contracted") return failTargetAnalysisInvariant("tsonic-csharp",
      "Argument completion requires its exact contracted type dependency.", input.source.call);
    if (completed.type === undefined) return undefined;
    const type = csharpTargetParameterValueType({ ...contractedParameter.targetParameter, type: completed.type }, binding.sourceForm);
    return Object.freeze({ association, selection, kind: "contracted", parameter: contractedParameter, type });
  }
  if (callable !== undefined) return undefined;
  if (selection.kind === "value") return undefined;
  const typeRequest = Object.freeze({ kind: "checked" as const, association, selection, state: Object.freeze({ depth: 0 }) });
  const completed = yield typeRequest;
  if (completed.request !== typeRequest || completed.kind !== "checked") return failTargetAnalysisInvariant("tsonic-csharp",
    "Argument completion requires its exact checked type dependency.", input.source.call);
  if (completed.type === undefined) return undefined;
  const type = csharpTargetParameterValueType({ name: parameter.parameterName, type: completed.type,
    passingMode: "by-value", paramsArray: parameter.rest }, binding.sourceForm);
  return Object.freeze({ association, selection, kind: "checked", type });
}
