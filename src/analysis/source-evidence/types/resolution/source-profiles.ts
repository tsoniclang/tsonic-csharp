import { csharpProviderBindingFromResolution } from "../../../../providers/model/relation-resolver.js";
import type { CsharpTargetParameter, TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { sourceTypeDescriptorStructure, type SourceCallableTypeEvidence, type SourceFileSemantics,
  type SourceTypeComponentEvidence, type SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { AstReader, Type } from "@tsonic/tsts";

import { classifyCsharpSourceProfileType } from "../../../../policy/identities/source-types.js";
import { csharpDelegateTargetType } from "../../../../target-model/types/carriers/delegates.js";

import { csharpNullableTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { csharpSourceErrorTargetType } from "../../../../target-model/types/carriers/scalar-types.js";
import { isCsharpVoidTargetType } from "../../../../target-model/types/identity.js";
import { csharpTargetTypeFromBinding } from "../../../../policy/types/storage/bindings.js";
import { nextState } from "./state.js";
import { csharpRuntimeParameterDefault } from "../../../../policy/types/storage/parameter-defaults.js";
import { resolveCsharpCallableTypeParameters } from "./callable-type-parameters.js";
import { csharpSourceStorageContext } from "./source-storage-projection.js";
import { resolveCsharpNativeParameterCarrier, selectCsharpPublishedParameterCarrier } from "./source-references.js";

import { selectCsharpSourceProfileCarrier } from "../../../../policy/operations/source-profiles/type-carriers.js";
import type { CsharpProviderRelationResolver } from "../../../../providers/model/relation-resolver.js";
import { selectCsharpSourceParameterVector } from "../../../../policy/types/callables/parameter-vector.js";
import { resolveCsharpSourceTypeDescriptor, resolveCsharpSourceEffectiveType, resolveCsharpPublishedCallableReturn } from "./effective-types.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
export function resolveCsharpSourceProfileBaseType(
  type: Type,
  queries: SourceFileSemantics,
  ast: AstReader,
  providers: CsharpProviderRelationResolver,
): TargetTypeRef | undefined {
  const identity = classifyCsharpSourceProfileType(type, queries, ast);
  if (identity?.kind !== "error") return undefined;
  const selected = providers.publishNativeIdentities(csharpSourceErrorTargetType(identity.errorName));
  return selected.kind === "resolved" ? selected.value : undefined;
}

export function resolveSourceProfileType(
  { host }: CsharpTypeResolutionScope,
  identity: ReturnType<typeof classifyCsharpSourceProfileType>,
  typeArguments: readonly TargetTypeRef[],
): TargetTypeRef | undefined {
  const binding = identity?.kind === "record" && typeArguments.length === 2
    ? csharpProviderBindingFromResolution(host.providers.findTargetBindingByMetadataName("System.Collections.Generic.Dictionary`2", "ordinary"))
    : undefined;
  const dictionaryCarrier = binding === undefined ? undefined : csharpTargetTypeFromBinding(binding, typeArguments);
  const selected = selectCsharpSourceProfileCarrier({ dictionaryCarrier }, identity, typeArguments);
  if (identity?.kind !== "error" || selected === undefined) return selected;
  const published = host.providers.publishNativeIdentities(selected);
  return published.kind === "resolved" ? published.value : undefined;
}
export function resolveUnionType(
  scope: CsharpTypeResolutionScope,
  type: Type,
  _queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const component = state.sourceComponent;
  return component?.selectedType !== type ? undefined
    : resolveCsharpSourceTypeDescriptor(scope, component.descriptor, state, component.occurrence);
}

export function resolveCallableType(
  { resolveCallableEvidence }: CsharpTypeResolutionScope,
  type: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const callable = queries.types.callable(type);
  return callable === undefined || queries.types.propertyInfos(type).length !== 0 ||
    queries.types.indexInfos(type).length !== 0 || queries.types.constructSignatures(type).length !== 0
    ? undefined
    : resolveCallableEvidence(callable, queries, state);
}

export function resolveCallableEvidence(
  scope: CsharpTypeResolutionScope,
  callable: SourceCallableTypeEvidence,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const { host, resolveNodeWithState, resolveSignatureParameterEvidence, resolveSourceTypeComponentEvidence } = scope;
  const parameters: CsharpTargetParameter[] = [];
  const expanded = new Set<SourceCallableTypeEvidence["parameters"][number]["sourceSymbol"]>();
  for (const [index, selectedParameter] of callable.parameters.entries()) {
    if (expanded.has(selectedParameter.sourceSymbol)) continue;
    let parameter = selectedParameter;
    let publishedRest: Extract<SourceTypeDescriptor, { readonly kind: "tuple" }> | undefined;
    const group = parameter.sourceSymbol === undefined ? []
      : callable.parameters.filter(candidate => candidate.sourceSymbol === parameter.sourceSymbol);
    if (group.length > 0) {
      const declaration = queries.declarations.primarySymbolDeclaration(parameter.sourceSymbol);
      const rest = declaration !== undefined && host.ast.is.IsParameterDeclaration(declaration) &&
        host.ast.as.AsParameterDeclaration(declaration)?.DotDotDotToken !== undefined;
      const syntax = declaration === undefined ? undefined : host.ast.typeNode(declaration);
      const publication = !rest || declaration === undefined ? undefined : host.effectiveTypes.get(declaration);
      if (publication?.kind === "refused") return undefined;
      if (publication !== undefined && publication.provenance.occurrence !== declaration) failTargetAnalysisInvariant(
        "tsonic-csharp", "A rest parameter requires its identical published Source occurrence.", declaration);
      const descriptor = publication === undefined ? undefined : sourceTypeDescriptorStructure(publication.type);
      const sourceType = publication !== undefined || !rest || syntax === undefined ? undefined : queries.types.authoredType(syntax);
      if (descriptor?.kind === "tuple" && descriptor.elements.length === group.length) {
        expanded.add(parameter.sourceSymbol);
        publishedRest = descriptor;
        parameter = { ...parameter, declaration: declaration!, parameterKind: "rest", omissionKind: "rest" };
      } else if (sourceType !== undefined && queries.types.isTuple(sourceType) &&
        queries.types.tupleElementInfos(sourceType).length === group.length) {
        expanded.add(parameter.sourceSymbol);
        parameter = { ...parameter, declaration: declaration!, type: sourceType, parameterKind: "rest", omissionKind: "rest" };
      }
    }
    const type = publishedRest === undefined ? resolveSignatureParameterEvidence(parameter, queries, state, "callable")
      : resolveCsharpSourceTypeDescriptor(scope, publishedRest, state, parameter.declaration);
    if (type === undefined) return undefined;
    const rest = parameter.parameterKind === "rest";
    const vector = selectCsharpSourceParameterVector({ name: `parameter${index}`, type, passingMode: "by-value",
      ...(parameter.acceptsOmission && !rest ? { optional: true } : {}),
      ...(rest ? { paramsArray: true } : {}),
    }, rest && type.kind === "tuple" ? publishedRest?.elements.map(element => ({ elementKind: element.kind })) ??
      queries.types.tupleElementInfos(parameter.type) : undefined);
    if (vector === undefined) return undefined;
    parameters.push(...vector);
  }
  const parameterTypes = parameters.map(parameter => parameter.type);
  const returned = callable.result.declaration === undefined ? undefined
    : host.sourceStorage.subject(callable.result.declaration, "return");
  const returnType = resolveSourceTypeComponentEvidence(
    callable.result,
    queries,
    { ...state, sourceStorageSubject: returned?.kind === "resolved" ? returned.subject : undefined },
  );
  if (returnType === undefined) {
    return undefined;
  }
  const optionalParameterIndexes = parameters.flatMap(
    (parameter, index) =>
      parameter.optional === true && parameter.paramsArray !== true
        ? [index]
        : [],
  );
  const restParameterIndexes = parameters.flatMap(
    (parameter, index) => parameter.paramsArray === true ? [index] : [],
  );
  if (
    restParameterIndexes.length > 1 ||
    restParameterIndexes[0] !== undefined &&
      restParameterIndexes[0] !== parameters.length - 1
  ) {
    return undefined;
  }
  const delegateOptions = {
    ...(optionalParameterIndexes.length === 0
      ? {}
      : { optionalParameterIndexes }),
    ...(restParameterIndexes[0] === undefined
      ? {}
      : { restParameterIndex: restParameterIndexes[0] }),
  };
  const signature = isCsharpVoidTargetType(returnType)
    ? csharpDelegateTargetType(
        "System.Action",
        parameterTypes,
        undefined,
        delegateOptions,
      )
    : csharpDelegateTargetType(
        "System.Func",
        parameterTypes,
        returnType,
        delegateOptions,
      );
  const typeParameters = resolveCsharpCallableTypeParameters(callable.result.declaration, queries.sourceFile, {
    ast: host.ast, types: { resolveNode: (node, file) => {
      const type = resolveNodeWithState(node, file, nextState(state));
      return type === undefined ? undefined : Object.freeze({ kind: "resolved" as const,
        sourceResult: csharpSourceValueResult(type)! });
    } },
    genericProjections: host.representations.genericProjections,
  });
  return typeParameters === undefined ? undefined : typeParameters.length === 0 ? signature
    : host.objectShapes.resolveCallableValue(signature, typeParameters);
}

export function resolveSignatureParameterEvidence(
  scope: CsharpTypeResolutionScope,
  parameter: SourceCallableTypeEvidence["parameters"][number],
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  use: "callable" | "parameter-list",
): TargetTypeRef | undefined {
  const { host, resolveSourceTypeComponentEvidence } = scope;
  const entry = parameter.declaration === undefined ? undefined : host.sourceStorage.subject(parameter.declaration, "input");
  const contextual = parameter.declaration === undefined || use !== "callable"
    ? undefined : selectCsharpPublishedParameterCarrier(scope, parameter.declaration, state);
  const resolved = contextual?.kind === "unresolved" ? undefined : contextual?.kind === "resolved" ? contextual.type
    : resolveSourceTypeComponentEvidence(
    {
      selectedType: parameter.type,
      ...(parameter.declaration === undefined
        ? {}
        : {
            declaration: parameter.declaration,
            ...(host.ast.typeNode(parameter.declaration) === undefined
              ? {}
              : {
                  authoredTypeNode: host.ast.typeNode(
                    parameter.declaration,
                  ),
                }),
          }),
    },
    queries,
    use === "callable"
      ? { ...state, sourceStorageSubject: entry?.kind === "resolved" ? entry.subject : undefined }
      : state,
  );
  const runtimeDefault = parameter.omissionKind === "initializer" && resolved !== undefined
    ? csharpRuntimeParameterDefault(resolved) : undefined;
  const nullable = use === "parameter-list"
    ? parameter.parameterKind === "optional"
    : parameter.omissionKind === "undefined";
  const carrier = runtimeDefault?.parameterType ?? (resolved === undefined || !nullable
    ? resolved
    : csharpNullableTargetType(resolved));
  const declaration = parameter.declaration;
  if (use !== "callable" || declaration === undefined) return carrier;
  const owner = host.ast.parent(declaration);
  return owner !== undefined && host.ast.body(owner) !== undefined
    ? resolveCsharpNativeParameterCarrier(scope, declaration, carrier, state) : carrier;
}

export function resolveSourceTypeComponentEvidence(
  scope: CsharpTypeResolutionScope,
  component: SourceTypeComponentEvidence,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const { host, resolveAuthoredAndSelectedSourceType, resolveTypeWithState, resolvePointerReturn } = scope;
  state = csharpSourceStorageContext(host, state, component.declaration);
  const pointer = component.declaration === undefined
    ? undefined
    : resolvePointerReturn(component.declaration, state);
  if (pointer !== undefined) {
    return pointer.type;
  }
  const occurrence = component.authoredTypeNode ?? component.declaration;
  const returned = component.authoredTypeNode !== undefined || component.declaration === undefined ? undefined
    : host.effectiveTypes.callableReturn(component.declaration);
  const published = returned ?? (occurrence === undefined ? undefined : host.effectiveTypes.get(occurrence));
  if (published !== undefined && occurrence !== undefined) {
    const selected = published.kind === "refused" ? state : { ...state, sourceComponent: {
      selectedType: component.selectedType, descriptor: published.type, occurrence,
    } };
    return returned === undefined ? resolveCsharpSourceEffectiveType(scope, occurrence, selected)?.result?.selectedType
      : resolveCsharpPublishedCallableReturn(scope, occurrence, selected)?.result?.selectedType;
  }
  const authoredSourceFile = component.authoredTypeNode === undefined
    ? queries.sourceFile
    : host.ast.getSourceFile(component.authoredTypeNode) ??
      queries.sourceFile;
  return component.authoredTypeNode === undefined
    ? resolveTypeWithState(
        component.selectedType,
        queries.sourceFile,
        nextState(state),
      )
    : resolveAuthoredAndSelectedSourceType(
        component.authoredTypeNode,
        authoredSourceFile,
        component.selectedType,
        queries.sourceFile,
        nextState(state),
      );
}
import { csharpSourceValueResult } from "./call-results.js";
