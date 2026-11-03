import type { CsharpTypeResolutionScope } from "./scope.js";
import type { SourceFile } from "@tsonic/tsts";
import type { CsharpTypeResolutionState } from "./model.js";
import type { CsharpSourceCallParameterReadDomain, ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import type { CsharpSourceCallResult } from "../../../../target-model/operations/source-call-results.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { completeCsharpSourceDeclarationCallAdoption, selectCsharpSourceCallResult } from "./call-results.js";

import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { combineCsharpTargetUnionMembers, csharpAbsenceTargetType } from "../../../../target-model/types/carriers/runtime-carriers.js";

import { nextState } from "./state.js";

import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";

import { formCsharpSourceCallContractSource, resolveFormedSourceCallContract,
  type CsharpSourceCallContractSelection, type CsharpSourceCallContractSource } from "./call-contracts.js";
import { getCsharpRuntimeUnionArms } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { selectCsharpConversion } from "../../../../policy/conversions/core.js";
import { csharpConversionIsApplicable } from "../../../../policy/conversions/applicability.js";
import { selectCsharpUnionCallMethods } from "./union-call-methods.js";
import { formCsharpSourceCallResultSource, type CsharpSourceCallResultSource } from "./call-result-source.js";
import { completeCsharpSourceCallArgumentParameterSource, type CsharpSourceCallArgumentParameterCompletion } from "./call-argument-source.js";

export function resolveSourceCallTypeArguments(
  { resolveSourceCallContract, resolveSourceCallInstantiation }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): readonly TargetTypeRef[] | undefined {
  const selected = resolveSourceCallContract(source, sourceFile, { depth: 0 }, "checked");
  if (selected.kind === "rejected") return undefined;
  const callable = selected.contract;
  return resolveSourceCallInstantiation(
    source,
    sourceFile,
    { depth: 0 },
    callable?.nativeSignature.methodTypeParameterIdentities,
    callable,
  )?.arguments;
}

export function resolveSourceCallParameter(
  scope: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  parameterIndex: number,
  sourceFile: SourceFile,
  domain: CsharpSourceCallParameterReadDomain,
): TargetTypeRef | undefined {
  if (domain !== "declared" && domain !== "callable") return undefined;
  if (domain === "declared" && source.sourceSelectedSignatureKind !== "resolved") return undefined;
  return resolveSelectedSourceCallParameter(scope, source, parameterIndex, sourceFile,
    domain === "declared" ? Object.freeze({ kind: "declaration",
      contract: scope.host.representations.completeSourceCallable(
        scope.host.representations.sourceCallableSource(source, sourceFile), "checked") })
      : scope.resolveSourceCallContract(source, sourceFile, { depth: 0 }, "checked"));
}

function resolveSelectedSourceCallParameter(
  { host, resolveSourceCallableContractType, resolveSourceCallSelectedType, sourceCallableTypeParametersMatch }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  parameterIndex: number,
  sourceFile: SourceFile,
  selected: CsharpSourceCallContractSelection,
): TargetTypeRef | undefined {
  const parameter = source.sourceSelectedSignatureParameters[parameterIndex];
  if (parameter === undefined) {
    return undefined;
  }
  if (selected.kind === "rejected") return undefined;
  const callable = selected.contract;
  const bodyParameter = callable?.kind === "source" ? callable.bodyInputs?.parameters.find(slot =>
    slot.sourceParameter === parameter.parameterDeclaration) : undefined;
  if (callable !== undefined && bodyParameter !== undefined) {
    return sourceCallableTypeParametersMatch(source, callable, selected.kind)
      ? resolveSourceCallableContractType(source, callable, bodyParameter.targetParameter.type, sourceFile, { depth: 0 })
      : undefined;
  }
  if (callable?.kind === "source" && parameter.rest && host.semantics(sourceFile).types.isTuple(parameter.selectedType)) {
    const declaration = parameter.parameterDeclaration;
    if (declaration === undefined || !callable.parameters.includes(declaration) ||
        !sourceCallableTypeParametersMatch(source, callable, selected.kind)) return undefined;
    const elements: TargetTypeRef[] = [];
    for (const parameter of callable.nativeParameters) if (parameter.sourceParameter === declaration) {
      const selected = resolveSourceCallableContractType(source, callable, parameter.targetParameter.type, sourceFile, { depth: 0 });
      if (selected === undefined) return undefined;
      elements.push(selected);
    }
    return Object.freeze({ kind: "tuple", elements: Object.freeze(elements) });
  }
  const contractedParameter = callable?.nativeParameters[parameterIndex];
  if (callable !== undefined && contractedParameter !== undefined) {
    if (
      (selected.kind !== "declaration" || selected.closedInput !== true) &&
        contractedParameter.sourceParameter !== parameter.parameterDeclaration ||
      !sourceCallableTypeParametersMatch(source, callable, selected.kind)
    ) {
      return undefined;
    }
    return resolveSourceCallableContractType(
      source,
      callable,
      contractedParameter.targetParameter.type,
      sourceFile,
      { depth: 0 },
    );
  }
  if (selected.kind === "value") return undefined;
  return resolveSourceCallSelectedType(
        source,
        parameter.parameterDeclaration,
        parameter.authoredTypeNode,
        parameter.selectedType,
        sourceFile,
        { depth: 0 },
      );
}

export function resolveSourceCallParameters(
  scope: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): readonly import("../../../../target-model/types/model.js").CsharpTargetParameter[] | undefined {
  const selected = scope.resolveSourceCallContract(source, sourceFile, { depth: 0 }, "implementation");
  if (selected.kind === "rejected") return undefined;
  const callable = selected.contract;
  if (callable !== undefined) {
    if (!scope.sourceCallableTypeParametersMatch(source, callable, selected.kind)) return undefined;
    const parameters = callable.nativeParameters.map(parameter => {
      const type = scope.resolveSourceCallableContractType(source, callable, parameter.targetParameter.type, sourceFile, { depth: 0 });
      return type === undefined ? undefined : Object.freeze({ ...parameter.targetParameter, type });
    });
    return parameters.some(parameter => parameter === undefined) ? undefined : Object.freeze(parameters as import("../../../../target-model/types/model.js").CsharpTargetParameter[]);
  }
  const parameters = source.sourceSelectedSignatureParameters.map((parameter, index) => {
    const type = resolveSelectedSourceCallParameter(scope, source, index, sourceFile, selected);
    return type === undefined ? undefined : {
      name: parameter.parameterName, passingMode: "by-value" as const,
      optional: parameter.acceptsOmission && !parameter.rest, paramsArray: parameter.rest, type,
    };
  });
  return parameters.some(parameter => parameter === undefined) ? undefined
    : Object.freeze(parameters.map(parameter => Object.freeze(parameter!)));
}

export function resolveSourceCallArgumentParameter(
  scope: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  binding: ResolvedSourceCallInfo["sourceArgumentBindings"][number],
  sourceFile: SourceFile,
  excludedSourceArgumentIndexes?: ReadonlySet<number>,
): TargetTypeRef | undefined {
  return completeCsharpSourceCallArgumentParameter(scope, formCsharpSourceCallContractSource(scope, source, sourceFile),
    binding, excludedSourceArgumentIndexes)?.type;
}

export function completeCsharpSourceCallArgumentParameter(
  scope: CsharpTypeResolutionScope,
  input: CsharpSourceCallContractSource,
  binding: ResolvedSourceCallInfo["sourceArgumentBindings"][number],
  excludedSourceArgumentIndexes?: ReadonlySet<number>,
): CsharpSourceCallArgumentParameterCompletion | undefined {
  const completion = completeCsharpSourceCallArgumentParameterSource(input, binding, excludedSourceArgumentIndexes);
  let step = completion.next();
  while (!step.done) {
    const request = step.value;
    const { source, sourceFile } = request.association.source;
    if (request.kind === "contract") step = completion.next(Object.freeze({ kind: "contract", request,
      selection: resolveFormedSourceCallContract(scope, request.association.source, request.state, "implementation") }));
    else if (request.kind === "parameters") step = completion.next(Object.freeze({ kind: "parameters", request,
      matches: scope.sourceCallableTypeParametersMatch(source, request.callable, request.selection.kind) }));
    else {
      const parameter = request.association.checkedParameter;
      const type = request.kind === "contracted"
        ? scope.resolveSourceCallableContractType(source, request.callable, request.parameter.targetParameter.type,
          sourceFile, request.state, request.association.excludedSourceArgumentIndexes)
        : scope.resolveSourceCallSelectedType(source, parameter.parameterDeclaration, parameter.authoredTypeNode,
          parameter.rest ? parameter.selectedType : request.association.binding.selectedParameterType,
          sourceFile, request.state, request.association.excludedSourceArgumentIndexes);
      step = completion.next(Object.freeze({ kind: request.kind, request, type }));
    }
  }
  return step.value;
}

export function resolveSourceCallResult(
  { resolveSourceCallResultWithState }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  nativeType: TargetTypeRef | undefined,
): CsharpSourceCallResult | undefined {
  return resolveSourceCallResultWithState(
    source,
    sourceFile,
    { depth: 0 },
    nativeType,
  );
}

export function resolveSourceCallResultWithState(
  scope: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  nativeType: TargetTypeRef | undefined,
): CsharpSourceCallResult | undefined {
  return resolveFormedCsharpSourceCallResultWithState(scope,
    formCsharpSourceCallResultSource(scope, formCsharpSourceCallContractSource(scope, source, sourceFile)), state, nativeType);
}

export function resolveFormedCsharpSourceCallResultWithState(
  scope: CsharpTypeResolutionScope,
  input: CsharpSourceCallResultSource,
  state: CsharpTypeResolutionState,
  nativeType: TargetTypeRef | undefined,
): CsharpSourceCallResult | undefined {
  const { host, resolveSourceCallableContractType, resolveSourceCallSelectedType, sourceCallableTypeParametersMatch,
    resolveSelectedValueWithState, resolveSourceCallInstantiation, resolveNodeWithState } = scope;
  const { source, sourceFile, queries, declaration, result } = input;
  if (input.contract.source !== source || input.contract.sourceFile !== sourceFile ||
    input.contract.callableSource.queries !== queries) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "Call result completion requires its exact retained callable source.", source.call);
  }
  const access = source.sourceCalleeAccess;
  if (nativeType === undefined && access?.kind === "property") {
    const receiver = resolveSelectedValueWithState(access.receiver.expression, access.receiver.type, sourceFile, nextState(state));
    const arms = getCsharpRuntimeUnionArms(receiver, host.typeDefinitions);
    const projectTypes = host.projectTypes();
    if (arms !== undefined && arms.length > 1 &&
      arms.every(arm => projectTypes.catalog.definitionForTarget(arm)?.kind === "class")) {
      if (source.sourceSelectedSignatureKind !== "resolved") return undefined;
      const property = queries.operations.propertyAccess(access.expression);
      const instantiation = resolveSourceCallInstantiation(source, sourceFile, nextState(state));
      if (property === undefined || instantiation === undefined) return undefined;
      const methods = selectCsharpUnionCallMethods({ ast: host.ast, navigation: host.navigation,
        semanticsFor: node => host.semanticsFor(node), projectTypes, typeDefinitions: host.typeDefinitions },
      property, arms, instantiation.arguments,
      (member, file) => resolveNodeWithState(member, file, nextState(state)));
      if (methods.kind !== "resolved") return undefined;
      const results = methods.methods.map(method => method.result);
      const raw = combineCsharpTargetUnionMembers(results.map(result => result.nativeType));
      const selected = combineCsharpTargetUnionMembers(results.map(result => result.selectedType));
      if (raw === undefined || selected === undefined || results.some(result =>
        !csharpConversionIsApplicable(selectCsharpConversion({ typeDefinitions: host.typeDefinitions,
          projectTypes, providers: host.providers, target: host.target }, result.selectedType, selected, "implicit"), "implicit"))) return undefined;
      return Object.freeze({ nativeType: raw, selectedType: selected });
    }
  }
  const completionDeclaration = source.sourceSelectedSignatureKind === "resolved"
    ? input.contract.callableSource.checked.declaration : undefined;
  const retain = (nativeType: TargetTypeRef | undefined): CsharpSourceCallResult | undefined => {
    const selected = selectCsharpSourceCallResult(host, nativeType, () => {
      const checked = result === undefined ? undefined : resolveSourceCallSelectedType(source, declaration,
        result.authoredTypeNode, result.selectedReturnType, sourceFile, nextState(state));
      return result?.authoredTypeNode === undefined && getCsharpNullableElementTargetType(nativeType) !== undefined && checked !== undefined
        ? combineCsharpTargetUnionMembers([checked, csharpAbsenceTargetType()]) : checked;
    });
    return selected;
  };
  if (nativeType !== undefined) return completeCsharpSourceDeclarationCallAdoption(host, completionDeclaration, retain(nativeType));
  const selection = resolveFormedSourceCallContract(scope, input.contract, state, "implementation");
  if (selection.kind === "rejected") return undefined;
  const callable = selection.contract;
  if (callable !== undefined) {
    if (!sourceCallableTypeParametersMatch(source, callable, selection.kind)) {
      return undefined;
    }
    if (callable.nativeSignature.sourceReturnType !== undefined) {
      const nativeType = resolveSourceCallableContractType(source, callable, callable.returnType, sourceFile, state);
      const selected = retain(resolveSourceCallableContractType(source, callable, callable.nativeSignature.sourceReturnType, sourceFile, state));
      return nativeType === undefined || selected === undefined ? undefined
        : completeCsharpSourceDeclarationCallAdoption(host, completionDeclaration, Object.freeze({ nativeType, selectedType: selected.selectedType }));
    }
    return completeCsharpSourceDeclarationCallAdoption(host, completionDeclaration, retain(resolveSourceCallableContractType(
      source,
      callable,
      callable.returnType,
      sourceFile,
      state,
    )));
  }
  if (selection.kind === "value") return undefined;
  if (result === undefined) {
    return undefined;
  }
  return completeCsharpSourceDeclarationCallAdoption(host, completionDeclaration, retain(resolveSourceCallSelectedType(
    source,
    declaration,
    result.authoredTypeNode,
    result.selectedReturnType,
    sourceFile,
    state,
  )));
}
