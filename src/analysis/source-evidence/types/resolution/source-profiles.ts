import { csharpProviderBindingFromResolution } from "../../../../providers/model/relation-resolver.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { retainCsharpUnionObjectShapes } from "./source-union-refinement.js";
import type { SourceCallableTypeEvidence, SourceFileSemantics, SourceTypeComponentEvidence } from "@tsonic/target-api/source";
import type { AstReader, Type } from "@tsonic/tsts";

import { classifyCsharpSourceProfileType } from "../../../../policy/identities/source-types.js";
import { combineCsharpTargetUnionMembers } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { csharpDelegateTargetType } from "../../../../target-model/types/carriers/delegates.js";

import { csharpNullableTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { csharpExceptionTargetType, csharpRuntimeErrorTargetType } from "../../../../target-model/types/carriers/scalar-types.js";
import { csharpTargetTypeFromBinding } from "../../../../policy/types/storage/bindings.js";
import { definedValues } from "./source-evidence.js";
import { nextState } from "./state.js";
import { csharpRuntimeParameterDefault } from "../../../../policy/types/storage/parameter-defaults.js";
import { resolveCsharpCallableTypeParameters } from "../../../constraints/callable-type-parameters.js";
import type { SourceStorageSubject } from "@tsonic/target-api/analysis";
import { csharpSourceStorageContext } from "./source-storage-projection.js";

import { selectCsharpSourceProfileCarrier } from "../../../../policy/operations/source-profiles/type-carriers.js";
export function resolveCsharpSourceProfileBaseType(
  type: Type,
  queries: SourceFileSemantics,
  ast: AstReader,
): TargetTypeRef | undefined {
  const identity = classifyCsharpSourceProfileType(type, queries, ast);
  return identity?.kind === "error" ? csharpRuntimeErrorTargetType(identity.errorName) : undefined;
}

export function resolveSourceProfileType(
  { host }: CsharpTypeResolutionScope,
  identity: ReturnType<typeof classifyCsharpSourceProfileType>,
  typeArguments: readonly TargetTypeRef[],
  subject: SourceStorageSubject | undefined,
): TargetTypeRef | undefined {
  let baseErrorCarrier: TargetTypeRef | undefined;
  if (identity?.kind === "error" && identity.baseException && typeArguments.length === 0) {
    const sourceFile = subject === undefined ? undefined : host.ast.getSourceFile(subject.node);
    if (subject === undefined || sourceFile !== undefined && !host.hasSemantics(sourceFile)) {
      baseErrorCarrier = csharpExceptionTargetType();
    } else {
      const demand = host.errorStorageDemands.storageFor(subject);
      if (demand.kind === "unresolved") return undefined;
      const origins = demand.kind === "writable" ? undefined : host.errorStorageDemands.closedStorageOriginsFor(subject);
      baseErrorCarrier = demand.kind === "writable" || origins?.kind === "complete" && origins.origins.length > 0 &&
        origins.origins.every(origin => host.errorStorageDemands.isNativeConstructor(origin.subject.node))
        ? csharpRuntimeErrorTargetType() : csharpExceptionTargetType();
    }
  }
  const binding = identity?.kind === "record" && typeArguments.length === 2
    ? csharpProviderBindingFromResolution(host.providers.findTargetBindingByMetadataName("System.Collections.Generic.Dictionary`2", "ordinary"))
    : undefined;
  const dictionaryCarrier = binding === undefined ? undefined : csharpTargetTypeFromBinding(binding, typeArguments);
  return selectCsharpSourceProfileCarrier({ baseErrorCarrier, dictionaryCarrier }, identity, typeArguments);
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
  const parameterTypes = callable.parameters.map((parameter) =>
    resolveSignatureParameterEvidence(parameter, queries, state, "callable")
  );
  if (parameterTypes.some((parameter) => parameter === undefined)) {
    return undefined;
  }
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
  const optionalParameterIndexes = callable.parameters.flatMap(
    (parameter, index) =>
      parameter.acceptsOmission && parameter.parameterKind !== "rest"
        ? [index]
        : [],
  );
  const restParameterIndexes = callable.parameters.flatMap(
    (parameter, index) => parameter.parameterKind === "rest" ? [index] : [],
  );
  if (
    restParameterIndexes.length > 1 ||
    restParameterIndexes[0] !== undefined &&
      restParameterIndexes[0] !== callable.parameters.length - 1
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
        parameterTypes as readonly TargetTypeRef[],
        undefined,
        delegateOptions,
      )
    : csharpDelegateTargetType(
        "System.Func",
        parameterTypes as readonly TargetTypeRef[],
        returnType,
        delegateOptions,
      );
  const typeParameters = resolveCsharpCallableTypeParameters(callable.result.declaration, queries.sourceFile, {
    ast: host.ast, types: { resolveNode: (node, file) => resolveNodeWithState(node, file, nextState(state)) },
    genericProjections: host.representations.genericProjections,
  });
  return typeParameters === undefined ? undefined : typeParameters.length === 0 ? signature
    : host.objectShapes.resolveCallableValue(signature, typeParameters);
}

export function resolveSignatureParameterEvidence(
  { host, resolveSourceTypeComponentEvidence }: CsharpTypeResolutionScope,
  parameter: SourceCallableTypeEvidence["parameters"][number],
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  use: "callable" | "parameter-list",
): TargetTypeRef | undefined {
  const entry = parameter.declaration === undefined ? undefined : host.sourceStorage.subject(parameter.declaration, "input");
  const resolved = resolveSourceTypeComponentEvidence(
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
  if (runtimeDefault !== undefined) return runtimeDefault.parameterType;
  const nullable = use === "parameter-list"
    ? parameter.parameterKind === "optional"
    : parameter.omissionKind === "undefined";
  return resolved === undefined || !nullable
    ? resolved
    : csharpNullableTargetType(resolved);
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
