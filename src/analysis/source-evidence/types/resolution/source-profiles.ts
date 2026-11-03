import { csharpProviderBindingFromResolution } from "../../../../providers/model/relation-resolver.js";
import type { CsharpTargetParameter, TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { retainCsharpUnionObjectShapes } from "./source-union-refinement.js";
import type { SourceCallableTypeEvidence, SourceFileSemantics, SourceTypeComponentEvidence } from "@tsonic/target-api/source";
import type { AstReader, Type } from "@tsonic/tsts";

import { classifyCsharpSourceProfileType } from "../../../../policy/identities/source-types.js";
import { combineCsharpTargetUnionMembers } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { csharpDelegateTargetType } from "../../../../target-model/types/carriers/delegates.js";

import { csharpNullableTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { csharpSourceErrorTargetType } from "../../../../target-model/types/carriers/scalar-types.js";
import { isCsharpVoidTargetType } from "../../../../target-model/types/identity.js";
import { csharpTargetTypeFromBinding } from "../../../../policy/types/storage/bindings.js";
import { definedValues } from "./source-evidence.js";
import { nextState } from "./state.js";
import { csharpRuntimeParameterDefault } from "../../../../policy/types/storage/parameter-defaults.js";
import { completeCsharpCallableDeclaration, completeCsharpCallableABI, formCsharpCallableDeclaration,
  type CsharpCompletedCallableDeclaration } from "./callable-type-parameters.js";
import { formCsharpCallableSignatureSource, formCsharpCallableTypeSource } from "./callable-signature-source.js";
import type { CsharpCallableSignatureSource, CsharpCallableTypeSource } from "../../../../target-model/records/types/callable-source.js";
import { resolveFormedCsharpTypeParameterConstraints } from "./type-parameter-constraints.js";
import { formCsharpSourceTypeComponentSource, resolveFormedCsharpSourceTypeComponent } from "./type-component-source.js";
import { resolveCsharpNativeParameterCarrier, selectCsharpContextualParameterCarrier } from "./source-references.js";

import { selectCsharpSourceProfileCarrier } from "../../../../policy/operations/source-profiles/type-carriers.js";
import type { CsharpProviderRelationResolver } from "../../../../providers/model/relation-resolver.js";
import { selectCsharpSourceParameterVector } from "../../../../policy/types/callables/parameter-vector.js";
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
  scope: CsharpTypeResolutionScope,
  type: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  return resolveFormedCsharpCallableType(scope, formCsharpCallableTypeSource(scope.host.ast, type, queries), state);
}

export function resolveFormedCsharpCallableType(
  scope: CsharpTypeResolutionScope,
  source: CsharpCallableTypeSource,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  if (source.kind === "not-callable") return undefined;
  if (source.signature.queries !== source.queries) return failTargetAnalysisInvariant("tsonic-csharp",
    "Callable completion requires its same checked signature query input.", source.signature.callable.result.declaration);
  const declared = resolveFormedCsharpCallableDeclarationSignature(scope, source.signature, state);
  return declared === undefined ? undefined : completeCsharpCallableSignatureABI(scope, declared);
}

export function resolveCallableEvidence(
  scope: CsharpTypeResolutionScope,
  callable: SourceCallableTypeEvidence,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const declared = resolveFormedCsharpCallableDeclarationSignature(scope,
    formCsharpCallableSignatureSource(scope.host.ast, callable, queries,
      formCsharpCallableDeclaration(callable.result.declaration, queries.sourceFile, scope.host.ast)), state);
  return declared === undefined ? undefined : completeCsharpCallableSignatureABI(scope, declared);
}

export interface CsharpCompletedCallableSignature {
  readonly source: CsharpCallableSignatureSource;
  readonly state: CsharpTypeResolutionState;
  readonly signature: TargetTypeRef;
  readonly declaration: CsharpCompletedCallableDeclaration;
}

export function resolveFormedCsharpCallableDeclarationSignature(
  { host, resolveNodeWithState, resolveSignatureParameterEvidence, resolveSourceTypeComponentEvidence }: CsharpTypeResolutionScope,
  source: CsharpCallableSignatureSource,
  state: CsharpTypeResolutionState,
): CsharpCompletedCallableSignature | undefined {
  const { callable, queries } = source;
  const parameters: CsharpTargetParameter[] = [];
  for (const { index, parameter, tupleElements } of source.parameters) {
    const type = resolveSignatureParameterEvidence(parameter, queries, state, "callable");
    if (type === undefined) return undefined;
    const rest = parameter.parameterKind === "rest";
    const vector = selectCsharpSourceParameterVector({ name: `parameter${index}`, type, passingMode: "by-value",
      ...(parameter.acceptsOmission && !rest ? { optional: true } : {}),
      ...(rest ? { paramsArray: true } : {}),
    }, rest && type.kind === "tuple" ? tupleElements : undefined);
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
  const declaration = source.declaration;
  if (declaration === undefined) return undefined;
  const constraints = declaration.typeParameters.map(parameter => Object.freeze({ source: parameter.constraint,
    resolution: resolveFormedCsharpTypeParameterConstraints(parameter.constraint, dependency =>
      resolveNodeWithState(dependency.node, dependency.sourceFile, nextState(state))),
  }));
  const completedDeclaration = completeCsharpCallableDeclaration(declaration, constraints);
  if (completedDeclaration === undefined) return undefined;
  return Object.freeze({ source, state, signature, declaration: completedDeclaration });
}

function completeCsharpCallableSignatureABI(
  { host }: Pick<CsharpTypeResolutionScope, "host">,
  declared: CsharpCompletedCallableSignature,
): TargetTypeRef | undefined {
  if (declared.declaration.source !== declared.source.declaration) return failTargetAnalysisInvariant("tsonic-csharp",
    "Callable ABI completion requires the exact completed authored signature.", declared.source.callable.result.declaration);
  const declaration = declared.declaration.source.declaration;
  const abi = completeCsharpCallableABI(declared.declaration,
    declaration === undefined ? [] : host.projectTypeCatalog.genericProjections(declaration));
  return abi === undefined ? undefined : abi.typeParameters.length === 0 ? declared.signature
    : host.objectShapes.resolveCallableValue(declared.signature, abi.typeParameters);
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
  scope: CsharpTypeResolutionScope,
  component: SourceTypeComponentEvidence,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const source = formCsharpSourceTypeComponentSource(scope, component, queries, state);
  const pointer = component.declaration === undefined
    ? undefined
    : scope.resolvePointerReturn(component.declaration, source.state);
  if (pointer !== undefined) {
    return pointer.type;
  }
  return resolveFormedCsharpSourceTypeComponent(scope, source);
}
