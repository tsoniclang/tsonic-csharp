import { sourceMarkerFactKey, type Node } from "@tsonic/tsts";
import { sourceTypeDescriptorsEqual, sourceTypeDescriptorStructure, type SourceEffectiveTypeOutcome, type SourceTypeDescriptor } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpDirectSourceFactSelection, CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { CsharpSourceCallResult } from "../../../../target-model/operations/source-call-results.js";
import type { CsharpTargetNamedTypeRef, CsharpTargetParameter, TargetTypeRef } from "../../../../target-model/types/model.js";
import { representCsharpSourceType, type CsharpSourceTypeRepresentationHost } from "../../../../policy/types/source-type-flow/representation.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";
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
import { selectCsharpClassFactoryType } from "../../../project-types/class-factory-types.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { getCsharpGenericOptionalParts } from "../../../../target-model/types/projections.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { csharpSourceTemplateState } from "./type-bindings.js";
import { selectCsharpObjectMethodImplementation } from "../../../objects/shapes/method-implementations.js";
import { createStructuralObjectShapeTarget } from "../../../objects/shapes/construction.js";
import { sourceFactSubjectsForNode } from "./source-evidence.js";
import { readCsharpSourceStruct } from "../../../../source/extension/markers.js";
import { csharpFlowReadPrincipalDeclaration } from "../../source-values.js";
import { selectCsharpMemberDeclaration } from "../../../objects/shapes/member-declarations.js";

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
    classStaticSide(descriptor) {
      // The owner class comes from each construct signature: its constructor's class, or, for an implicit constructor,
      // the class the signature's published result names.
      const owners = new Set(descriptor.constructs.map(signature => {
        const declaration = signature.declaration;
        if (declaration !== undefined && host.ast.is.IsConstructorDeclaration(declaration)) return host.ast.parent(declaration);
        if (declaration !== undefined && (host.ast.is.IsClassDeclaration(declaration) || host.ast.is.IsClassExpression(declaration))) return declaration;
        return declaration === undefined && signature.result.kind === "declared" ? signature.result.declaration : undefined;
      }));
      const owner = owners.size === 1 ? [...owners][0] : undefined;
      if (owner === undefined || !(host.ast.is.IsClassDeclaration(owner) || host.ast.is.IsClassExpression(owner))) return false;
      return descriptor.members.every(member => member.origin.kind === "class-prototype" ? member.origin.owner === owner
        : member.origin.kind === "declared" && host.ast.parent(member.origin.declaration) === owner &&
          host.ast.hasModifierKind(member.origin.declaration, "static"));
    },
    memberDeclaration: declaration => selectCsharpMemberDeclaration(host, declaration),
    shapeKind(descriptor) {
      if (descriptor.members.length === 0) return "storage";
      let contract = true;
      for (const member of descriptor.members) {
        const owner = member.origin.kind === "declared" ? host.ast.parent(member.origin.declaration) : undefined;
        if (owner === undefined) return undefined;
        if (host.ast.is.IsObjectLiteralExpression(owner)) contract = false;
      }
      return contract ? "contract" : "storage";
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
      if (owner?.kind === "class" && owner.local !== true) return instance;
      if (owner?.local === true) return selectCsharpClassFactoryType(host.ast, host.projectTypeCatalog, instance);
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
        const selected = parameters[index];
        if (selected === undefined) return undefined;
        // An optional parameter accepts absence: its C# type is nullable, as in the declared method ABI.
        const type = parameter.kind === "optional" && getCsharpNullableElementTargetType(selected) === undefined &&
          getCsharpGenericOptionalParts(selected) === undefined ? csharpNullableTargetType(selected) : selected;
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
      if (source !== undefined && host.ast.is.IsObjectLiteralExpression(source) && shape.members.some(member =>
        member.memberKind === "method" && member.sourceDeclarations?.some(declaration =>
          host.ast.is.IsMethodDeclaration(declaration) && host.ast.body(declaration) !== undefined &&
          host.ast.parent(declaration) === source) === true)) {
        const methodImplementation = selectCsharpObjectMethodImplementation(shape.members, {
          ast: host.ast, navigation: host.navigation, objectMethodSources: host.objectMethodSources,
          typeResolver: { resolveNode: scope.resolveNodeWithState },
        }, state, source);
        if (methodImplementation === undefined) return undefined;
        shape = { ...shape, methodImplementation,
          targetType: createStructuralObjectShapeTarget(shape.members, shape.implements, host.typeParameterConstraints,
            shape.targetType.kind === "target-named" && (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true,
            methodImplementation) };
      }
      return host.objectShapes.retainShape(shape, source);
    },
    declaredType(declaration, typeArguments, descriptor) {
      const caller = occurrence;
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
        return typeArguments.length !== 0 ? undefined : host.typeParameterConstraints.resolve(parameter);
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
      const direct = scope.selectDirectSourceFacts([declaration], queries.sourceFile, nextState(state));
      if (direct.kind !== "not-applicable") return direct.kind === "resolved" ? direct.type : undefined;
      if (host.ast.is.IsTypeAliasDeclaration(declaration)) {
        if (descriptor.cut === "unexpressible") return undefined;
        if (descriptor.definition === undefined && descriptor.cut !== "recursion") return undefined;
        if (host.navigation.isProjectDeclaration(declaration) && descriptor.definition !== undefined &&
          containsRecursiveAlias(descriptor.definition, declaration) && typeArguments.some(argument => argument.kind !== "type-parameter")) {
          const template = host.effectiveTypes.get(declaration);
          if (template?.kind !== "resolved" || template.type.kind !== "declared" ||
            template.type.declaration !== declaration || template.type.typeArguments.length !== typeArguments.length) return undefined;
          const parameters = host.ast.typeParameters(declaration);
          if (resolveCsharpSourceTypeDescriptor(scope, template.type,
            csharpSourceTemplateState(parameters, nextState(state)), declaration) === undefined) return undefined;
        }
        return scope.sourceUnionDefinitions.resolveDescriptor(declaration,
          typeArguments, descriptor.definition, definition => resolveCsharpSourceTypeDescriptor(scope,
            definition, definition.kind === "declared" && definition.declaration === declaration && definition.definition !== undefined
              ? csharpSourceTemplateState(host.ast.typeParameters(declaration), nextState(state)) : nextState(state), occurrence),
          descriptor.definition !== undefined && sourceTypeDescriptorStructure(descriptor.definition).kind === "optional");
      }
      if (host.navigation.isProjectDeclaration(declaration)) {
        const structure = descriptor.definition === undefined ? undefined : sourceTypeDescriptorStructure(descriptor.definition);
        if (host.ast.is.IsInterfaceDeclaration(declaration) &&
          (structure?.kind === "callable" || structure?.kind === "array" || structure?.kind === "tuple")) {
          return resolveCsharpSourceTypeDescriptor(scope, structure, nextState(state), occurrence);
        }
        return projectPublishedDeclaration(scope, descriptor, typeArguments, state);
      }
      return scope.resolveProviderType([declaration], typeArguments);
    },
  };
}

function containsRecursiveAlias(type: SourceTypeDescriptor, declaration: Node): boolean {
  const pending = [type];
  const visited = new Set<SourceTypeDescriptor>();
  while (pending.length > 0) {
    const selected = pending.pop()!;
    if (visited.has(selected)) continue;
    visited.add(selected);
    if (selected.kind === "declared") {
      if (selected.declaration === declaration && selected.cut === "recursion") return true;
      pending.push(...selected.typeArguments);
      if (selected.definition !== undefined) pending.push(selected.definition);
    } else if (selected.kind === "optional") pending.push(selected.value);
    else if (selected.kind === "array") pending.push(selected.element);
    else if (selected.kind === "union") pending.push(...selected.types);
    else if (selected.kind === "tuple") pending.push(...selected.elements.map(element => element.type));
    else if (selected.kind === "shape" || selected.kind === "callable") {
      for (const signature of [...selected.calls, ...selected.constructs]) {
        pending.push(signature.result, ...signature.parameters.map(parameter => parameter.type));
      }
      if (selected.kind === "shape") pending.push(...selected.members.map(member => member.type),
        ...selected.indexes.flatMap(index => [index.key, index.value]));
    }
  }
  return false;
}

function projectPublishedDeclaration(
  scope: CsharpTypeResolutionScope,
  descriptor: Extract<SourceTypeDescriptor, { readonly kind: "declared" }>,
  arguments_: readonly TargetTypeRef[],
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const declaration = descriptor.declaration;
  const definition = scope.host.projectTypeCatalog.definitionForDeclaration(declaration);
  if (definition === undefined) return undefined;
  const parameters = [...definition.outerTypeParameters, ...definition.typeParameters];
  if (parameters.length !== descriptor.typeArguments.length || parameters.length !== arguments_.length) return undefined;
  const publication = { bindings: parameters.map((parameter, index) => ({
    declaration: parameter, type: descriptor.typeArguments[index]!,
  })), definitions: [descriptor] };
  const projections = resolveCsharpProjectionArguments(scope, declaration, publication, arguments_, state,
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
  const component = outcome.provenance.component?.authoredTypeNode;
  let marker: CsharpDirectSourceFactSelection = { kind: "not-applicable" };
  if (outcome.type.kind === "shape" || outcome.type.kind === "declared") {
    marker = resolvePublishedMarkerType(scope, node, state);
    if (marker.kind === "not-applicable" && component !== undefined && component !== node) {
      marker = resolvePublishedMarkerType(scope, component, state);
    }
  }
  let type = marker.kind === "resolved" ? marker.type : marker.kind === "unavailable" ? undefined
    : resolveCsharpSourceTypeDescriptor(scope, outcome.type, state, node);
  if (marker.kind === "resolved") {
    const declaration = csharpFlowReadPrincipalDeclaration(scope.host.ast, scope.host.navigation, node);
    const principal = declaration === undefined ? undefined : scope.host.effectiveTypes.get(declaration);
    const declared = principal === undefined || principal.kind === "refused" || principal.provenance.occurrence !== declaration
      ? undefined : sourceTypeDescriptorStructure(principal.type);
    const present = getCsharpNullableElementTargetType(type);
    if (present !== undefined && declared?.kind === "optional" && sourceTypeDescriptorsEqual(declared.value, outcome.type)) type = present;
  }
  return Object.freeze({ outcome, result: type === undefined ? undefined
    : Object.freeze({ nativeType: type, selectedType: type, effectiveType: outcome }) });
}

function resolvePublishedMarkerType(
  scope: CsharpTypeResolutionScope,
  node: Node,
  state: CsharpTypeResolutionState,
): CsharpDirectSourceFactSelection {
  const { host } = scope;
  const expression = host.ast.is.IsTypeQueryNode(node) ? host.ast.as.AsTypeQueryNode(node)?.ExprName : node;
  const reference = host.navigation.sourceReferenceFor(expression);
  const declaration = host.ast.is.IsVariableDeclaration(node) ? node : reference?.declaration;
  const fact = declaration === undefined ? undefined : readCsharpSourceStruct(host.sourceFacts, declaration);
  if (fact !== undefined) {
    const definition = host.projectTypeCatalog.definitionForDeclaration(declaration);
    if (fact.valueType !== true || definition?.kind !== "struct" || definition.declaration !== declaration) return { kind: "unavailable" };
    const type = host.projectTypeCatalog.targetTypeForDeclaration(declaration, []);
    const owner = type === undefined ? undefined : host.projectTypeCatalog.definitionForTarget(type);
    return type === undefined || owner?.kind !== "struct" || owner.declaration !== declaration
      ? { kind: "unavailable" } : { kind: "resolved", type };
  }
  const sourceFile = host.ast.getSourceFile(node);
  if (sourceFile === undefined) return { kind: "unavailable" };
  const direct = scope.selectDirectSourceFacts(sourceFactSubjectsForNode(node, host.navigation), sourceFile, nextState(state));
  if (direct.kind !== "not-applicable") return direct;
  const initializer = declaration !== undefined && host.ast.is.IsVariableDeclaration(declaration) &&
    host.ast.typeNode(declaration) === undefined ? host.ast.as.AsVariableDeclaration(declaration)?.Initializer : undefined;
  return initializer === undefined ? { kind: "not-applicable" } : scope.selectDirectSourceFacts(
    [initializer], host.ast.getSourceFile(initializer) ?? sourceFile, nextState(state));
}
