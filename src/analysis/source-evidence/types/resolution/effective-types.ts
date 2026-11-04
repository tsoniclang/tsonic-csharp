import { sourceMarkerFactKey, type Node } from "@tsonic/tsts";
import type { SourceEffectiveTypeOutcome, SourceTypeDescriptor } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { CsharpSourceCallResult } from "../../../../target-model/operations/source-call-results.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { representCsharpSourceType, type CsharpSourceTypeRepresentationHost } from "../../../../policy/types/source-type-flow/representation.js";
import { csharpSourceTypeParameter, csharpSourceTypeParameters } from "../../../../source/extension/type-parameters.js";
import { bindCsharpSourceDeclarationArguments } from "./generic-arguments.js";
import { nextState } from "./state.js";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import { csharpRuntimeLocationTargetType, csharpRuntimeRawPointerTargetType } from "../../../../target-model/types/carriers/runtime-carriers.js";

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
    declaredType(declaration, typeArguments, component) {
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
      const selected = component?.selectedType ?? queries.declarations.declaredType(declaration);
      const bindings = selected === undefined ? undefined : queries.types.typeArgumentBindings(selected);
      const parameters = csharpSourceTypeParameters(declaration, host.ast);
      const sources = parameters.map(parameter => bindings?.find(binding => binding.declaration === parameter)?.argumentType);
      const representedState = bindCsharpSourceDeclarationArguments(scope, declaration, typeArguments, sources, state, queries);
      if (representedState === undefined) return undefined;
      const direct = scope.resolveDirectSourceFacts([...(component?.authoredTypeNode === undefined ? [] : [component.authoredTypeNode]), declaration,
        ...(selected === undefined ? [] : queries.facts.typeSubjects(selected))], queries.sourceFile, nextState(representedState));
      if (direct !== undefined) return direct;
      if (host.ast.is.IsTypeAliasDeclaration(declaration)) {
        const typeNode = host.ast.typeNode(declaration);
        return typeNode === undefined ? undefined
          : scope.resolveNodeWithState(typeNode, queries.sourceFile, nextState(representedState));
      }
      if (host.navigation.isProjectDeclaration(declaration)) {
        return scope.projectSourceDeclarationTargetType(declaration, typeArguments,
          sources, nextState(state), selected);
      }
      return scope.resolveProviderType([declaration, ...(selected === undefined ? [] : queries.facts.typeSubjects(selected))], typeArguments);
    },
  };
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
