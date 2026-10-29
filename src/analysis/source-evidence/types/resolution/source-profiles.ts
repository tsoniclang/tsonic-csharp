import { csharpProviderBindingFromResolution } from "../../../../providers/model/relation-resolver.js";
import type { CsharpTargetNamedTypeRef, CsharpTargetParameter, TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { retainCsharpUnionObjectShapes } from "./source-union-refinement.js";
import type { SourceCallableTypeEvidence, SourceFileSemantics, SourceTypeComponentEvidence } from "@tsonic/target-api/source";
import type { AstReader, Type } from "@tsonic/tsts";

import { classifyCsharpSourceProfileType } from "../../../../policy/identities/source-types.js";
import { combineCsharpTargetUnionMembers } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { csharpDelegateTargetType } from "../../../../target-model/types/carriers/delegates.js";

import { csharpNullableTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { csharpRuntimeErrorTargetType } from "../../../../target-model/types/carriers/scalar-types.js";
import { csharpTargetTypeFromBinding } from "../../../../policy/types/storage/bindings.js";
import { definedValues } from "./source-evidence.js";
import { nextState } from "./state.js";
import { csharpRuntimeParameterDefault } from "../../../../policy/types/storage/parameter-defaults.js";
import { resolveCsharpCallableTypeParameters } from "./callable-type-parameters.js";
import { csharpSourceStorageContext } from "./source-storage-projection.js";
import { resolveCsharpNativeParameterCarrier, selectCsharpContextualParameterCarrier } from "./source-references.js";

import { selectCsharpSourceProfileCarrier } from "../../../../policy/operations/source-profiles/type-carriers.js";
import type { CsharpProviderRelationResolver } from "../../../../providers/model/relation-resolver.js";
import { selectCsharpSourceParameterVector } from "../../../../policy/types/callables/parameter-vector.js";
export function resolveCsharpSourceProfileBaseType(
  type: Type,
  queries: SourceFileSemantics,
  ast: AstReader,
  providers: CsharpProviderRelationResolver,
): TargetTypeRef | undefined {
  const identity = classifyCsharpSourceProfileType(type, queries, ast);
  if (identity?.kind !== "error") return undefined;
  const selected = providers.publishNativeIdentities(csharpRuntimeErrorTargetType(identity.errorName));
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
  { host, resolveTypeWithState, sourceUnions, sourceUnionDefinitions }: CsharpTypeResolutionScope,
  type: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const structural = host.structuralTypes.resolveUnion(type, queries.sourceFile, state);
  if (structural.kind !== "not-applicable") return structural.kind === "resolved" ? structural.type : undefined;
  const rawSourceMembers = queries.types.unionOrIntersectionTypes(type);
  const sourceMembers = definedValues(rawSourceMembers);
  if (sourceMembers.length !== rawSourceMembers.length) {
    return undefined;
  }
  let resolved: readonly (TargetTypeRef | undefined)[] = [];
  const carrier = sourceUnionDefinitions.resolve(type, queries, state, () => {
    resolved = sourceMembers.map(member => resolveTypeWithState(member, queries.sourceFile, nextState(state)));
    if (resolved.some(member => member === undefined)) return { carrier: undefined, arms: [] };
    const arms = resolved as readonly TargetTypeRef[];
    return { carrier: retainCsharpUnionObjectShapes(combineCsharpTargetUnionMembers(arms),
      host.structuralTypes.resolveTarget), arms };
  });
  return sourceUnions.retain(carrier, resolved.map((arm, index) => ({ source: sourceMembers[index]!, carrier: arm! })), queries, state);
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
  { host, resolveNodeWithState, resolveSignatureParameterEvidence, resolveSourceTypeComponentEvidence }: CsharpTypeResolutionScope,
  callable: SourceCallableTypeEvidence,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const parameters: CsharpTargetParameter[] = [];
  const expanded = new Set<SourceCallableTypeEvidence["parameters"][number]["sourceSymbol"]>();
  for (const [index, selectedParameter] of callable.parameters.entries()) {
    if (expanded.has(selectedParameter.sourceSymbol)) continue;
    let parameter = selectedParameter;
    const group = parameter.sourceSymbol === undefined ? []
      : callable.parameters.filter(candidate => candidate.sourceSymbol === parameter.sourceSymbol);
    if (group.length > 0) {
      const declaration = queries.declarations.primarySymbolDeclaration(parameter.sourceSymbol);
      const rest = declaration !== undefined && host.ast.is.IsParameterDeclaration(declaration) &&
        host.ast.as.AsParameterDeclaration(declaration)?.DotDotDotToken !== undefined;
      const syntax = declaration === undefined ? undefined : host.ast.typeNode(declaration);
      const sourceType = !rest || declaration === undefined ? undefined : syntax === undefined
        ? queries.declarations.declaredValueType(declaration) : queries.types.authoredType(syntax);
      if (sourceType !== undefined && queries.types.isTuple(sourceType) &&
        queries.types.tupleElementInfos(sourceType).length === group.length) {
        expanded.add(parameter.sourceSymbol);
        parameter = { ...parameter, declaration: declaration!, type: sourceType, parameterKind: "rest", omissionKind: "rest" };
      }
    }
    const type = resolveSignatureParameterEvidence(parameter, queries, state, "callable");
    if (type === undefined) return undefined;
    const rest = parameter.parameterKind === "rest";
    const vector = selectCsharpSourceParameterVector({ name: `parameter${index}`, type, passingMode: "by-value",
      ...(parameter.acceptsOmission && !rest ? { optional: true } : {}),
      ...(rest ? { paramsArray: true } : {}),
    }, rest && type.kind === "tuple" ? queries.types.tupleElementInfos(parameter.type) : undefined);
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
  const signature = returnType.kind === "target-named" &&
      (returnType as CsharpTargetNamedTypeRef).csharpSpecialType === "void"
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
      return type === undefined ? undefined : Object.freeze({ kind: "resolved" as const, type });
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
  const published = parameter.declaration === undefined ? undefined : host.representations.sourceParameter(parameter.declaration);
  if (published !== undefined) {
    const selected = published.nativeParameters[0];
    return published.nativeParameters.length === 1 ? selected?.targetParameter.type : undefined;
  }
  const entry = parameter.declaration === undefined ? undefined : host.sourceStorage.subject(parameter.declaration, "input");
  const contextual = parameter.declaration === undefined || use !== "callable" || host.ast.typeNode(parameter.declaration) !== undefined
    ? undefined : selectCsharpContextualParameterCarrier(scope, parameter.declaration, queries, state);
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
  { host, resolveAuthoredAndSelectedSourceType, resolveTypeWithState, resolvePointerReturn }: CsharpTypeResolutionScope,
  component: SourceTypeComponentEvidence,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  state = csharpSourceStorageContext(host, state, component.declaration);
  const pointer = component.declaration === undefined
    ? undefined
    : resolvePointerReturn(component.declaration, state);
  if (pointer !== undefined) {
    return pointer.type;
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
