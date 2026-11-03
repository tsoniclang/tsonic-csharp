import { csharpProviderBindingFromResolution } from "../../../../providers/model/relation-resolver.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { retainCsharpUnionObjectShapes } from "./source-union-refinement.js";
import type { SourceCallableTypeEvidence, SourceFileSemantics, SourceTypeComponentEvidence } from "@tsonic/target-api/source";
import type { AstReader, Type } from "@tsonic/tsts";

import { classifyCsharpSourceProfileType } from "../../../../policy/identities/source-types.js";
import { combineCsharpTargetUnionMembers } from "../../../../target-model/types/carriers/runtime-carriers.js";

import { csharpNullableTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { csharpSourceErrorTargetType } from "../../../../target-model/types/carriers/scalar-types.js";
import { csharpTargetTypeFromBinding } from "../../../../policy/types/storage/bindings.js";
import { definedValues } from "./source-evidence.js";
import { nextState } from "./state.js";
import { csharpRuntimeParameterDefault } from "../../../../policy/types/storage/parameter-defaults.js";
import { completeCsharpCallableABI, formCsharpCallableDeclaration } from "./callable-type-parameters.js";
import { formCsharpCallableSignatureSource, formCsharpCallableTypeSource } from "./callable-signature-source.js";
import type { CsharpCallableSignatureSource } from "../../../../target-model/records/types/callable-source.js";
import { resolveFormedCsharpTypeParameterConstraints } from "./type-parameter-constraints.js";
import { formCsharpSourceTypeComponentSource, resolveFormedCsharpSourceTypeComponent } from "./type-component-source.js";
import { completeCsharpCallableSignatureSource, formCsharpCallableSignatureInput, formCsharpCallableTypeInput,
  type CsharpCallableSignatureInput, type CsharpCallableTypeInput, type CsharpCompletedCallableSignature } from "./callable-signature-completion.js";
import { resolveCsharpNativeParameterCarrier, selectCsharpContextualParameterCarrier } from "./source-references.js";

import { selectCsharpSourceProfileCarrier } from "../../../../policy/operations/source-profiles/type-carriers.js";
import type { CsharpProviderRelationResolver } from "../../../../providers/model/relation-resolver.js";
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
  return resolveFormedCsharpCallableType(scope, formCsharpCallableTypeInput(scope.host,
    formCsharpCallableTypeSource(scope.host.ast, type, queries), state));
}

export function resolveFormedCsharpCallableType(
  scope: CsharpTypeResolutionScope,
  input: CsharpCallableTypeInput,
): TargetTypeRef | undefined {
  if (input.kind === "not-callable") {
    if (input.source.kind !== "not-callable") return failTargetAnalysisInvariant("tsonic-csharp",
      "Callable completion requires its exact retained eligibility decision.");
    return undefined;
  }
  if (input.source.kind !== "callable" || input.signature.source !== input.source.signature ||
      input.signature.state !== input.state || input.source.signature.queries !== input.source.queries) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Callable completion requires its exact bound signature Source input.");
  }
  const declared = resolveCsharpCallableSignatureInput(scope, input.signature);
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

export function resolveFormedCsharpCallableDeclarationSignature(
  scope: CsharpTypeResolutionScope,
  source: CsharpCallableSignatureSource,
  state: CsharpTypeResolutionState,
): CsharpCompletedCallableSignature | undefined {
  return resolveCsharpCallableSignatureInput(scope, formCsharpCallableSignatureInput(scope.host, source, state));
}

function resolveCsharpCallableSignatureInput(
  scope: CsharpTypeResolutionScope,
  input: CsharpCallableSignatureInput,
): CsharpCompletedCallableSignature | undefined {
  const completion = completeCsharpCallableSignatureSource(input);
  let selected = completion.next();
  while (!selected.done) {
    const request = selected.value;
    if (request.kind === "parameter") {
      const type = scope.resolveSignatureParameterEvidence(request.parameter.parameter, input.source.queries, input.state, "callable");
      selected = completion.next(Object.freeze({ kind: "parameter", request, type }));
    } else if (request.kind === "result") {
      const type = scope.resolveSourceTypeComponentEvidence(input.source.callable.result, input.source.queries, input.returnState);
      selected = completion.next(Object.freeze({ kind: "result", request, type }));
    } else {
      const resolution = resolveFormedCsharpTypeParameterConstraints(request.source, dependency =>
        scope.resolveNodeWithState(dependency.node, dependency.sourceFile, nextState(input.state)));
      selected = completion.next(Object.freeze({ kind: "constraint", request, resolution }));
    }
  }
  return selected.value;
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
