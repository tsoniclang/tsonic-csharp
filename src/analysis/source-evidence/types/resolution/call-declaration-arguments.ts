import type { Node } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { resolveFormedCsharpTypeParameterSource,
  type CsharpTypeParameterSource } from "./source-evidence.js";
import { formCsharpAuthoredTypeSelectionSource, bindCsharpAuthoredTypeSelectionSource,
  resolveFormedAuthoredAndSelectedSourceType, type CsharpAuthoredTypeSelectionSource } from "./selected-values.js";
import { nextState } from "./state.js";
import type { CsharpSourceCallableSource } from "../../../program/source-callable-source.js";
import { resolveCsharpProjectionArguments } from "./projection-arguments.js";
import type { CsharpProjectedType } from "../../../../target-model/types/projections.js";

type SelectedArgument = NonNullable<ResolvedSourceCallInfo["sourceSelectedMethodTypeArguments"]>[number];

export interface CsharpCallDeclarationArgumentsSource {
  readonly source: ResolvedSourceCallInfo;
  readonly callableSource: CsharpSourceCallableSource;
  readonly owner: Node | undefined;
  readonly queries: SourceFileSemantics;
  readonly arguments: readonly {
    readonly argument: SelectedArgument;
    readonly parameter: CsharpTypeParameterSource;
    readonly selection: CsharpAuthoredTypeSelectionSource;
  }[];
}

export interface CsharpCompletedCallDeclarationArguments {
  readonly source: CsharpCallDeclarationArgumentsSource;
  readonly state: CsharpTypeResolutionState;
  readonly arguments: readonly TargetTypeRef[];
}

export function formCsharpCallDeclarationArgumentsSource(
  { host }: Pick<CsharpTypeResolutionScope, "host">,
  callableSource: CsharpSourceCallableSource,
  parameters: readonly CsharpTypeParameterSource[],
): CsharpCallDeclarationArgumentsSource {
  const { source, queries, sourceFile } = callableSource;
  const arguments_ = Array.from(source.sourceSelectedMethodTypeArguments ?? [], (argument, index) => {
    const parameter = parameters[index];
    if (argument === undefined || parameter === undefined || parameter.type !== argument.typeParameter ||
      parameter.queries !== queries) return failTargetAnalysisInvariant("tsonic-csharp",
      "A declared call argument requires every original selected argument.", source.call);
    return Object.freeze({ argument,
      parameter,
      selection: formCsharpAuthoredTypeSelectionSource({ host }, argument.explicitTypeNode, sourceFile,
        argument.selectedType, sourceFile, undefined),
    });
  });
  const owner = callableSource.checked.declaration ?? source.sourceCalleeAccess?.selectedDeclaration ?? source.sourceCallee.selectedDeclaration;
  return Object.freeze({ source, queries, callableSource, owner, arguments: Object.freeze(arguments_) });
}

export function resolveFormedCsharpCallDeclarationArguments(
  scope: CsharpTypeResolutionScope,
  input: CsharpCallDeclarationArgumentsSource,
  state: CsharpTypeResolutionState,
): CsharpCompletedCallDeclarationArguments | undefined {
  const selected = input.source.sourceSelectedMethodTypeArguments ?? [];
  if (input.callableSource.source !== input.source || input.callableSource.queries !== input.queries ||
    input.arguments.length !== selected.length || Array.from(input.arguments).some((entry, index) =>
    entry === undefined || entry.argument !== selected[index] || entry.parameter.type !== entry.argument.typeParameter ||
    entry.parameter.queries !== input.queries || entry.selection.authoredTypeNode !== entry.argument.explicitTypeNode ||
    entry.selection.selectedType !== entry.argument.selectedType || entry.selection.selectedSourceFile !== input.queries.sourceFile)) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A declared call requires its exact ordered checked argument captures.", input.source.call);
  }
  const parameters = new Set<string>();
  const sources = new Set<SelectedArgument["typeParameter"]>();
  for (const entry of input.arguments) {
    const parameter = resolveFormedCsharpTypeParameterSource(entry.parameter, scope.host.typeParameterConstraints);
    if (parameter?.kind !== "type-parameter" || parameters.has(parameter.identity) || sources.has(entry.argument.typeParameter)) return undefined;
    parameters.add(parameter.identity);
    sources.add(entry.argument.typeParameter);
  }
  const arguments_: TargetTypeRef[] = [];
  for (const entry of input.arguments) {
    const type = resolveFormedAuthoredAndSelectedSourceType(scope,
      bindCsharpAuthoredTypeSelectionSource(entry.selection, Object.freeze(nextState(state))));
    if (type === undefined) return undefined;
    arguments_.push(type);
  }
  return Object.freeze({ source: input, state, arguments: Object.freeze(arguments_) });
}

export function completeCsharpBodyCallArguments(
  scope: CsharpTypeResolutionScope,
  input: CsharpCompletedCallDeclarationArguments,
): readonly TargetTypeRef[] | undefined {
  const owner = input.source.owner;
  if (owner === undefined) {
    if (input.source.callableSource.checked.project) return failTargetAnalysisInvariant("tsonic-csharp",
      "A project call cannot omit its retained declaration owner.", input.source.source.call);
    return input.arguments;
  }
  const receipt = scope.host.projectTypeCatalog.callableProjections(owner);
  if (receipt.declaration !== owner) return failTargetAnalysisInvariant("tsonic-csharp",
    "A body call requires its selected callee's exact current A publication.", input.source.source.call);
  return completeProjectionArguments(scope, input, receipt.kind === "source" ? receipt.projections : []);
}

function completeProjectionArguments(
  scope: CsharpTypeResolutionScope,
  input: CsharpCompletedCallDeclarationArguments,
  projections: readonly CsharpProjectedType[],
): readonly TargetTypeRef[] | undefined {
  if (projections.length === 0) return input.arguments;
  const owner = input.source.owner;
  if (owner === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
    "A projection argument requires its retained callee declaration.", input.source.source.call);
  const selected = resolveCsharpProjectionArguments(scope, owner,
    input.source.arguments.map(entry => entry.argument.selectedType), input.arguments, input.state, projections);
  return selected === undefined ? undefined : Object.freeze([...input.arguments, ...selected]);
}
