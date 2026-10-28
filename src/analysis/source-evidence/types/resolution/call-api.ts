import type { CsharpTypeResolutionScope } from "./scope.js";
import type { SourceFile } from "@tsonic/tsts";
import type { CsharpTypeResolutionState } from "./model.js";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import type { CsharpSourceCallResult } from "../../../../target-model/operations/source-call-results.js";
import { selectCsharpSourceCallResult } from "./call-results.js";

import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { combineCsharpTargetUnionMembers, csharpAbsenceTargetType } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { csharpTargetParameterValueType } from "../../../../target-model/types/member-facts.js";

import { nextState } from "./state.js";

import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";

import type { CsharpSourceCallContractSelection } from "./call-contracts.js";
import { csharpSourceCallArgumentParameter } from "../../../../policy/types/callables/source-callable-contract.js";

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
): TargetTypeRef | undefined {
  return resolveSelectedSourceCallParameter(scope, source, parameterIndex, sourceFile,
    scope.resolveSourceCallContract(source, sourceFile, { depth: 0 }, "checked"));
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
  { resolveSourceCallContract, resolveSourceCallableContractType, resolveSourceCallSelectedType, sourceCallableTypeParametersMatch }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  binding: ResolvedSourceCallInfo["sourceArgumentBindings"][number],
  sourceFile: SourceFile,
  excludedSourceArgumentIndexes?: ReadonlySet<number>,
): TargetTypeRef | undefined {
  const parameter = source.sourceSelectedSignatureParameters[
    binding.sourceParameterIndex
  ];
  if (parameter === undefined) {
    return undefined;
  }
  const selected = resolveSourceCallContract(source, sourceFile, { depth: 0 }, "implementation");
  if (selected.kind === "rejected") return undefined;
  const callable = selected.contract;
  const contractedParameter = callable === undefined ? undefined : csharpSourceCallArgumentParameter(callable, binding.effectiveArgumentIndex);
  if (callable !== undefined && contractedParameter !== undefined) {
    if (
      selected.kind === "value" && contractedParameter.sourceParameter !== parameter.parameterDeclaration &&
        !(callable.kind === "source" && callable.bodyInputs?.parameters.some(slot => slot.sourceParameter === parameter.parameterDeclaration)) ||
      !sourceCallableTypeParametersMatch(source, callable, selected.kind)
    ) {
      return undefined;
    }
    const contracted = resolveSourceCallableContractType(
      source,
      callable,
      contractedParameter.targetParameter.type,
      sourceFile,
      { depth: 0 },
      excludedSourceArgumentIndexes,
    );
    return contracted === undefined
      ? undefined
      : csharpTargetParameterValueType(
          {
            ...contractedParameter.targetParameter,
            type: contracted,
          },
          binding.sourceForm,
        );
  }
  if (callable !== undefined) return undefined;
  if (selected.kind === "value") return undefined;
  const selectedType = resolveSourceCallSelectedType(
    source,
    parameter.parameterDeclaration,
    parameter.authoredTypeNode,
    parameter.rest ? parameter.selectedType : binding.selectedParameterType,
    sourceFile,
    { depth: 0 },
    excludedSourceArgumentIndexes,
  );
  return selectedType === undefined ? undefined : csharpTargetParameterValueType({
    name: parameter.parameterName, type: selectedType, passingMode: "by-value", paramsArray: parameter.rest,
  }, binding.sourceForm);
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
  { host, resolveSourceCallContract, resolveSourceCallableContractType, resolveSourceCallSelectedType, sourceCallableTypeParametersMatch, sourceCallSelectedDeclaration }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  nativeType: TargetTypeRef | undefined,
): CsharpSourceCallResult | undefined {
  const declaration = sourceCallSelectedDeclaration(source);
  const queries = host.semantics(sourceFile);
  const result = queries.operations.callResult(source);
  const retain = (nativeType: TargetTypeRef | undefined): CsharpSourceCallResult | undefined => {
    const selected = selectCsharpSourceCallResult(host, nativeType, () => {
      const checked = result === undefined ? undefined : resolveSourceCallSelectedType(source, declaration,
        result.authoredTypeNode, result.selectedReturnType, sourceFile, nextState(state));
      return result?.authoredTypeNode === undefined && getCsharpNullableElementTargetType(nativeType) !== undefined && checked !== undefined
        ? combineCsharpTargetUnionMembers([checked, csharpAbsenceTargetType()]) : checked;
    });
    return selected;
  };
  if (nativeType !== undefined) return retain(nativeType);
  const selection = resolveSourceCallContract(source, sourceFile, state, "implementation");
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
        : Object.freeze({ nativeType, selectedType: selected.selectedType });
    }
    return retain(resolveSourceCallableContractType(
      source,
      callable,
      callable.returnType,
      sourceFile,
      state,
    ));
  }
  if (selection.kind === "value") return undefined;
  if (result === undefined) {
    return undefined;
  }
  return retain(resolveSourceCallSelectedType(
    source,
    declaration,
    result.authoredTypeNode,
    result.selectedReturnType,
    sourceFile,
    state,
  ));
}
