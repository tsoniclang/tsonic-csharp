import type { CsharpTypeResolutionScope } from "./scope.js";
import type { SourceFile } from "@tsonic/tsts";
import type { CsharpTypeResolutionState } from "./model.js";
import type { CsharpSourceCallParameterReadDomain, ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import type { CsharpSourceCallResult } from "../../../../target-model/operations/source-call-results.js";
import { completeCsharpSourceCallAdoption, selectCsharpSourceCallResult } from "./call-results.js";

import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { combineCsharpTargetUnionMembers, csharpAbsenceTargetType } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { csharpTargetParameterValueType } from "../../../../target-model/types/member-facts.js";

import { nextState } from "./state.js";

import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";

import type { CsharpSourceCallContractSelection } from "./call-contracts.js";
import { csharpSourceCallArgumentParameter } from "../../../../policy/types/callables/source-callable-contract.js";
import { asSourceNode } from "@tsonic/target-api/source";
import type { Node } from "@tsonic/tsts";
import { getCsharpRuntimeUnionArms } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { getCsharpCallableValueSignature } from "../../../../target-model/types/carriers/delegates.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";
import { substituteTargetTypeParameters } from "../../../../policy/types/resolution/substitution.js";
import { targetTypeRefKey } from "../../../../target-model/types/equality.js";
import { selectCsharpConversion } from "../../../../policy/conversions/core.js";
import { csharpConversionIsApplicable } from "../../../../policy/conversions/applicability.js";

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
      contract: scope.host.representations.sourceCallable(source, sourceFile, "checked") })
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
  { host, resolveSourceCallContract, resolveSourceCallableContractType, resolveSourceCallSelectedType, sourceCallableTypeParametersMatch, sourceCallSelectedDeclaration,
    resolveSelectedValueWithState, resolveSourceCallInstantiation, resolveNodeWithState }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  nativeType: TargetTypeRef | undefined,
): CsharpSourceCallResult | undefined {
  const declaration = sourceCallSelectedDeclaration(source);
  const queries = host.semantics(sourceFile);
  const result = queries.operations.callResult(source);
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
      const selectedProperties = queries.types.propertyInfos(property.receiver.type).filter(info => info.symbol === property.selectedSymbol);
      const declarations = [...new Set([
        ...queries.facts.selectedSubjects(property.selectedSymbol, property.selectedDeclaration),
        ...selectedProperties.flatMap(info => info.rootSymbols.flatMap(symbol => queries.declarations.symbolDeclarations(symbol))),
      ].flatMap(subject => {
        const node = asSourceNode(subject, host.ast);
        return node !== undefined && host.navigation.isProjectDeclaration(node) ? [node] : [];
      }))];
      const results: CsharpSourceCallResult[] = [];
      for (const arm of arms) {
        const owners = new Set<Node>();
        const pending = [arm];
        const visited = new Set<string>();
        while (pending.length > 0) {
          const type = pending.pop()!;
          const key = targetTypeRefKey(type);
          if (visited.has(key)) continue;
          visited.add(key);
          const definition = projectTypes.catalog.definitionForTarget(type);
          if (definition !== undefined) owners.add(definition.declaration);
          pending.push(...(projectTypes.directSupertypes(type) ?? []));
        }
        const candidates = declarations.filter(member => {
          if (host.ast.kindName(member) !== "KindMethodDeclaration" || host.ast.hasModifierKind(member, "static")) return false;
          const owner = projectTypes.catalog.definitionContainingDeclaration(member);
          return owner !== undefined && owners.has(owner.declaration);
        });
        if (candidates.length !== 1) return undefined;
        const member = candidates[0]!;
        const file = host.ast.getSourceFile(member);
        const signature = file === undefined ? undefined
          : getCsharpCallableValueSignature(resolveNodeWithState(member, file, nextState(state)));
        const parameters = host.ast.typeParameters(member).map(parameter =>
          parameter === undefined ? undefined : csharpSourceTypeParameter(parameter, host.ast));
        if (signature === undefined || signature.returnPassing !== undefined ||
          parameters.length !== instantiation.arguments.length || parameters.some(parameter => parameter === undefined)) return undefined;
        const substitutions = new Map(parameters.map((parameter, index) =>
          [parameter!.identity, instantiation.arguments[index]!] as const));
        const native = projectTypes.instantiateMemberType(member, arm,
          substituteTargetTypeParameters(signature.returnType, substitutions));
        if (native.kind !== "resolved") return undefined;
        const selected = Object.freeze({ nativeType: native.type, selectedType: native.type });
        const completed = host.ast.body(member) === undefined ? selected : completeCsharpSourceCallAdoption(host, selected);
        if (completed === undefined) return undefined;
        results.push(completed);
      }
      const raw = combineCsharpTargetUnionMembers(results.map(result => result.nativeType));
      const selected = combineCsharpTargetUnionMembers(results.map(result => result.selectedType));
      if (raw === undefined || selected === undefined || results.some(result =>
        !csharpConversionIsApplicable(selectCsharpConversion({ typeDefinitions: host.typeDefinitions,
          projectTypes, providers: host.providers, target: host.target }, result.selectedType, selected, "implicit"), "implicit"))) return undefined;
      return Object.freeze({ nativeType: raw, selectedType: selected });
    }
  }
  const complete = (selected: CsharpSourceCallResult | undefined): CsharpSourceCallResult | undefined =>
    declaration !== undefined && host.navigation.isProjectDeclaration(declaration) && host.ast.body(declaration) !== undefined
      ? completeCsharpSourceCallAdoption(host, selected) : selected;
  const retain = (nativeType: TargetTypeRef | undefined): CsharpSourceCallResult | undefined => {
    const selected = selectCsharpSourceCallResult(host, nativeType, () => {
      const checked = result === undefined ? undefined : resolveSourceCallSelectedType(source, declaration,
        result.authoredTypeNode, result.selectedReturnType, sourceFile, nextState(state));
      return result?.authoredTypeNode === undefined && getCsharpNullableElementTargetType(nativeType) !== undefined && checked !== undefined
        ? combineCsharpTargetUnionMembers([checked, csharpAbsenceTargetType()]) : checked;
    });
    return selected;
  };
  if (nativeType !== undefined) return complete(retain(nativeType));
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
        : complete(Object.freeze({ nativeType, selectedType: selected.selectedType }));
    }
    return complete(retain(resolveSourceCallableContractType(
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
  return complete(retain(resolveSourceCallSelectedType(
    source,
    declaration,
    result.authoredTypeNode,
    result.selectedReturnType,
    sourceFile,
    state,
  )));
}
