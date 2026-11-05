import { sourceMarkerFactKey, type Node } from "@tsonic/tsts";
import type { SourceEffectiveTypeOutcome, SourceTypeDescriptor } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { CsharpSourceCallResult } from "../../../../target-model/operations/source-call-results.js";
import type { CsharpTargetParameter, TargetTypeRef } from "../../../../target-model/types/model.js";
import { representCsharpSourceType, type CsharpSourceTypeRepresentationHost } from "../../../../policy/types/source-type-flow/representation.js";
import { csharpSourceTypeParameter, csharpSourceTypeParameters } from "../../../../source/extension/type-parameters.js";
import { csharpSourceBindings } from "./type-bindings.js";
import { resolveCsharpProjectionArguments } from "./projection-arguments.js";
import { nextState } from "./state.js";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import { csharpRuntimeLocationTargetType, csharpRuntimeRawPointerTargetType } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { csharpDelegateTargetType } from "../../../../target-model/types/carriers/delegates.js";
import { isCsharpVoidTargetType } from "../../../../target-model/types/identity.js";
import { selectCsharpSourceParameterVector } from "../../../../policy/types/callables/parameter-vector.js";
import { resolveCsharpCallableTypeParameters } from "./callable-type-parameters.js";
import { csharpSourceValueResult } from "./call-results.js";
import { classifyCsharpSourceProfileDeclaration } from "../../../../policy/identities/source-types.js";
import { csharpProviderBindingFromResolution } from "../../../../providers/model/relation-resolver.js";
import { csharpTargetTypeFromBinding } from "../../../../policy/types/storage/bindings.js";
import { csharpRecordDictionaryCarrier } from "../../../../target-model/types/carriers/collections.js";
import { csharpClassFactoryTargetType } from "../../../../target-model/types/carriers/class-factories.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";

export function resolveCsharpEffectiveCallTypeArgument(
  scope: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  parameter: import("@tsonic/tsts").Type,
  state: CsharpTypeResolutionState,
): { readonly type: TargetTypeRef | undefined } | undefined {
  const publication = scope.host.effectiveTypes.callInstantiation(source.call);
  if (publication === undefined) return undefined;
  if (publication.call !== source) failTargetAnalysisInvariant("tsonic-csharp",
    "A Host call instantiation must retain the exact selected Source call.", source.call);
  const queries = scope.host.semanticsFor(source.call);
  const symbol = queries.declarations.typeSymbol(parameter);
  const declarations = symbol === undefined ? [] : queries.declarations.symbolDeclarations(symbol)
    .filter((declaration): declaration is Node => declaration !== undefined && scope.host.ast.is.IsTypeParameterDeclaration(declaration));
  const selected = queries.declarations.signatureDeclaration(source.selectedSignature);
  const owner = source.sourceCalleeAccess?.selectedDeclaration ?? source.sourceCallee.selectedDeclaration;
  const arguments_ = publication.method.filter(argument => declarations.includes(argument.declaration) &&
    (scope.host.ast.parent(argument.declaration) === selected || scope.host.ast.parent(argument.declaration) === owner));
  const argument = arguments_.length === 1 ? arguments_[0] : undefined;
  return { type: argument === undefined ? undefined : resolveCsharpSourceTypeDescriptor(scope, argument.type, state, source.call) };
}

export interface CsharpEffectiveSourceTypeSelection {
  readonly outcome: SourceEffectiveTypeOutcome;
  readonly result: CsharpSourceCallResult | undefined;
}

export function createCsharpSourceTypeRepresentationHost(
  scope: CsharpTypeResolutionScope,
  state: CsharpTypeResolutionState,
  occurrence: Node | undefined,
): CsharpSourceTypeRepresentationHost {
  const { host } = scope;
  return {
    target: host.target,
    typeParameterConstraints: host.typeParameterConstraints,
    indexType(key, value) {
      const binding = csharpProviderBindingFromResolution(host.providers.findTargetBindingByMetadataName(
        "System.Collections.Generic.Dictionary`2", "ordinary"));
      const type = binding === undefined ? undefined : csharpTargetTypeFromBinding(binding, [key, value]);
      return type === undefined ? undefined : csharpRecordDictionaryCarrier(type);
    },
    memberKind(declaration) {
      return host.ast.is.IsMethodDeclaration(declaration) || host.ast.is.IsMethodSignatureDeclaration(declaration) ? "method" : "property";
    },
    memberTypeParameters(signature) {
      return resolvePublishedCallableParameters(scope, signature, state);
    },
    constructorType(signatures, results) {
      const instance = results[0];
      if (instance === undefined || signatures.length !== results.length ||
        results.some(result => !targetTypeRefEquals(result, instance))) return undefined;
      const owner = host.projectTypeCatalog.definitionForTarget(instance);
      if (owner?.abstract === true) return undefined;
      if (owner?.local === true && instance.kind === "target-named" && owner.factoryName !== undefined) {
        const names = new Set(host.ast.members(owner.declaration).flatMap(member => {
          const name = host.ast.name(member);
          return name !== undefined && (host.ast.is.IsIdentifier(name) || host.ast.is.IsStringLiteral(name)) ? [host.ast.text(name)] : [];
        }));
        let createMethodName = "Create";
        while (names.has(createMethodName)) createMethodName = `_${createMethodName}`;
        names.add(createMethodName);
        let instanceTestMethodName = "IsInstance";
        while (names.has(instanceTestMethodName)) instanceTestMethodName = `_${instanceTestMethodName}`;
        return csharpClassFactoryTargetType(owner.declaration, instance, owner.factoryName,
          owner.outerTypeParameters.length + owner.outerTypeProjections.length, createMethodName, instanceTestMethodName);
      }
      if (signatures.length !== 1) return undefined;
      const signature = signatures[0]!;
      const parameters = signature.parameters.map(parameter => resolveCsharpSourceTypeDescriptor(scope,
        parameter.type, nextState(state), occurrence));
      if (parameters.some(parameter => parameter === undefined)) return undefined;
      return createCsharpSourceTypeRepresentationHost(scope, state, occurrence).callableType(signature,
        parameters as readonly TargetTypeRef[], instance);
    },
    callableType(signature, parameters, result) {
      const nativeParameters: CsharpTargetParameter[] = [];
      for (const [index, parameter] of signature.parameters.entries()) {
        const type = parameters[index];
        if (type === undefined) return undefined;
        const vector = selectCsharpSourceParameterVector({ name: `argument${index}`, type, passingMode: "by-value",
          ...(parameter.kind === "optional" ? { optional: true } : {}),
          ...(parameter.kind === "rest" ? { paramsArray: true } : {}),
        }, type.kind === "tuple" ? type.elements.map(() => ({ elementKind: "required" as const })) : undefined);
        if (vector === undefined) return undefined;
        nativeParameters.push(...vector);
      }
      const rests = nativeParameters.flatMap((parameter, index) => parameter.paramsArray === true ? [index] : []);
      if (rests.length > 1 || rests[0] !== undefined && rests[0] !== nativeParameters.length - 1) return undefined;
      const returnsVoid = isCsharpVoidTargetType(result);
      const represented = csharpDelegateTargetType(returnsVoid ? "System.Action" : "System.Func",
        nativeParameters.map(parameter => parameter.type), returnsVoid ? undefined : result, {
          optionalParameterIndexes: nativeParameters.flatMap((parameter, index) => parameter.optional === true ? [index] : []),
          ...(rests[0] === undefined ? {} : { restParameterIndex: rests[0] }),
        });
      if (signature.typeParameters.length === 0) return represented;
      const typeParameters = resolvePublishedCallableParameters(scope, signature, state);
      if (typeParameters === undefined) return undefined;
      return host.objectShapes.resolveCallableValue(represented, typeParameters);
    },
    retainShape(shape) {
      const owners = [...new Set(shape.members.flatMap(member => (member.sourceDeclarations ?? []).flatMap(declaration => {
        const owner = host.ast.parent(declaration);
        const file = host.ast.getSourceFile(owner);
        return owner !== undefined && file !== undefined && host.hasSemantics(file) &&
          host.navigation.isProjectDeclaration(owner) && (host.ast.is.IsObjectLiteralExpression(owner) ||
            host.ast.is.IsTypeLiteralNode(owner)) ? [owner] : [];
      })))];
      const source = owners.length === 1 ? owners[0] : occurrence;
      const selected = occurrence === undefined ? undefined : host.representations.scopedTargetType(occurrence);
      return selected === undefined ? host.objectShapes.retainShape(shape, source) : host.objectShapes.resolveTarget(selected);
    },
    declaredType(declaration, typeArguments, component, descriptor) {
      const caller = occurrence ?? component?.contextualCall?.call;
      const declarationFile = host.ast.getSourceFile(declaration);
      if (caller === undefined && (declarationFile === undefined || !host.hasSemantics(declarationFile))) {
        return host.navigation.isProjectDeclaration(declaration) ? undefined : scope.resolveProviderType([declaration], typeArguments);
      }
      const queries = host.semanticsFor(caller ?? declaration);
      const bound = state.sourceBindings?.get(declaration);
      if (bound !== undefined && typeArguments.length === 0) return bound.targetType;
      const parameter = csharpSourceTypeParameter(declaration, host.ast);
      if (parameter !== undefined) {
        const scoped = host.representations.scopedTargetType(declaration);
        if (scoped !== undefined && typeArguments.length === 0) return scoped;
        const sourceType = component?.selectedType ?? queries.types.authoredType(declaration) ??
          queries.declarations.declaredType(declaration);
        return sourceType === undefined || typeArguments.length !== 0 ? undefined
          : host.typeParameterConstraints.resolve(parameter, { sourceFile: queries.sourceFile, sourceType });
      }
      const marker = host.sourceFacts?.getFact(declaration, sourceMarkerFactKey);
      if (marker?.kind === "type-marker" && marker.marker === "pointer") {
        return typeArguments.length === 1 ? csharpRuntimeLocationTargetType(typeArguments[0]!) : undefined;
      }
      if (marker?.kind === "type-marker" && marker.marker === "raw-pointer") {
        return typeArguments.length === 0 ? csharpRuntimeRawPointerTargetType() : undefined;
      }
      const profile = classifyCsharpSourceProfileDeclaration(declaration, host.ast);
      if (profile !== undefined) return scope.resolveSourceProfileType(profile, typeArguments);
      const selected = component?.selectedType ?? queries.declarations.declaredType(declaration);
      const bindings = selected === undefined ? undefined : queries.types.typeArgumentBindings(selected);
      const parameters = csharpSourceTypeParameters(declaration, host.ast);
      if ((bindings?.length ?? 0) !== typeArguments.length) return undefined;
      const representedState = csharpSourceBindings((bindings ?? []).map(binding => binding.declaration),
        (bindings ?? []).map(binding => binding.argumentType), typeArguments, state);
      if (representedState === undefined) return undefined;
      const direct = scope.resolveDirectSourceFacts([...(component?.authoredTypeNode === undefined ? [] : [component.authoredTypeNode]), declaration,
        ...(selected === undefined ? [] : queries.facts.typeSubjects(selected))], queries.sourceFile, nextState(representedState));
      if (direct !== undefined) return direct;
      if (host.ast.is.IsTypeAliasDeclaration(declaration)) return scope.sourceUnionDefinitions.resolveDescriptor(declaration,
        typeArguments, descriptor.definition === undefined ? undefined : () => resolveCsharpSourceTypeDescriptor(scope,
          descriptor.definition!, nextState(representedState), occurrence));
      if (host.navigation.isProjectDeclaration(declaration)) {
        return projectPublishedDeclaration(scope, declaration, representedState);
      }
      const ownArguments = parameters.map(parameter => parameter === undefined ? undefined
        : representedState.sourceBindings?.get(parameter)?.targetType);
      return ownArguments.some(argument => argument === undefined) ? undefined
        : scope.resolveProviderType([declaration, ...(selected === undefined ? [] : queries.facts.typeSubjects(selected))],
          ownArguments as readonly TargetTypeRef[]);
    },
  };
}

function projectPublishedDeclaration(
  scope: CsharpTypeResolutionScope,
  declaration: Node,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const definition = scope.host.projectTypeCatalog.definitionForDeclaration(declaration);
  if (definition === undefined) return undefined;
  const parameters = [...definition.outerTypeParameters, ...definition.typeParameters];
  const bindings = parameters.map(parameter => state.sourceBindings?.get(parameter));
  if (bindings.some(binding => binding === undefined)) return undefined;
  const arguments_ = bindings.map(binding => binding!.targetType);
  const sources = bindings.map(binding => binding!.sourceType);
  const projections = resolveCsharpProjectionArguments(scope, declaration, sources, arguments_, state,
    [...definition.outerTypeProjections, ...definition.typeProjections], parameters);
  if (projections === undefined) return undefined;
  const outerCount = definition.outerTypeParameters.length;
  const projectionCount = definition.outerTypeProjections.length;
  return scope.host.projectTypeCatalog.targetTypeForDeclaration(declaration, [
    ...arguments_.slice(0, outerCount), ...projections.slice(0, projectionCount),
    ...arguments_.slice(outerCount), ...projections.slice(projectionCount),
  ]);
}

function resolvePublishedCallableParameters(
  scope: CsharpTypeResolutionScope,
  signature: Extract<SourceTypeDescriptor, { readonly kind: "callable" }>["calls"][number],
  state: CsharpTypeResolutionState,
) {
  if (signature.typeParameters.length === 0) return Object.freeze([]);
  const { host } = scope;
  const declaration = signature.declaration;
  const sourceFile = declaration === undefined ? undefined : host.ast.getSourceFile(declaration);
  if (declaration === undefined || sourceFile === undefined) return undefined;
  const parameters = resolveCsharpCallableTypeParameters(declaration, sourceFile, {
    ast: host.ast,
    types: { resolveNode(node, file) {
      const type = scope.resolveNodeWithState(node, file, nextState(state));
      const sourceResult = csharpSourceValueResult(type);
      return sourceResult === undefined ? undefined : { kind: "resolved", sourceResult };
    } },
    genericProjections: host.representations.genericProjections,
  });
  return parameters === undefined || signature.typeParameters.some((parameter, index) => parameters[index]?.declaration !== parameter)
    ? undefined : parameters;
}

export function resolveCsharpSourceTypeDescriptor(
  scope: CsharpTypeResolutionScope,
  descriptor: SourceTypeDescriptor,
  state: CsharpTypeResolutionState,
  occurrence: Node | undefined,
): TargetTypeRef | undefined {
  return representCsharpSourceType(createCsharpSourceTypeRepresentationHost(scope, state, occurrence), descriptor);
}

export function resolveCsharpSourceEffectiveType(
  scope: CsharpTypeResolutionScope,
  node: Node | undefined,
  state: CsharpTypeResolutionState,
): CsharpEffectiveSourceTypeSelection | undefined {
  if (node === undefined) return undefined;
  const outcome = scope.host.effectiveTypes.get(node);
  return resolvePublishedOutcome(scope, node, outcome, state);
}

export function resolveCsharpPublishedCallableReturn(
  scope: CsharpTypeResolutionScope,
  declaration: Node,
  state: CsharpTypeResolutionState,
): CsharpEffectiveSourceTypeSelection | undefined {
  return resolvePublishedOutcome(scope, declaration, scope.host.effectiveTypes.callableReturn(declaration), state);
}

function resolvePublishedOutcome(
  scope: CsharpTypeResolutionScope,
  node: Node,
  outcome: SourceEffectiveTypeOutcome | undefined,
  state: CsharpTypeResolutionState,
): CsharpEffectiveSourceTypeSelection | undefined {
  if (outcome === undefined) return undefined;
  if (outcome.kind === "refused") {
    state.rejectNativeResolution?.(Object.freeze({ kind: "rejected", subject: outcome.site,
      code: outcome.code, reason: outcome.reason }));
    return Object.freeze({ outcome, result: undefined });
  }
  if (outcome.provenance.occurrence !== node) {
    failTargetAnalysisInvariant("tsonic-csharp", "A Host effective type must retain its exact value occurrence.", node);
  }
  const type = resolveCsharpSourceTypeDescriptor(scope, outcome.type, state, node);
  return Object.freeze({ outcome, result: type === undefined ? undefined
    : Object.freeze({ nativeType: type, selectedType: type, effectiveType: outcome }) });
}
