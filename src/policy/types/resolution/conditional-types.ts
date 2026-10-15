import type { Node, Type, TypeAliasApplicationInfo } from "@tsonic/tsts";
import { sourceNodeIdentity, sourceTransformedTypeFactEvidenceNodes, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpProjectedType } from "../../../target-model/types/projections.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import type { CsharpTypeResolutionScope } from "./engine.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { csharpBoundSourceType, csharpSourceBindings } from "./type-bindings.js";
import { nextState } from "./state.js";

export function resolveCsharpConditionalApplication(
  scope: CsharpTypeResolutionScope,
  application: TypeAliasApplicationInfo,
  arguments_: readonly TargetTypeRef[],
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
  authoredRoot: Node = application.typeNode,
): TargetTypeRef | undefined {
  if (application.kind !== "conditional" || application.bindings.length !== arguments_.length) return undefined;
  const bound = csharpSourceBindings(application.bindings.map(binding => binding.declaration),
    application.bindings.map(binding => binding.argument), arguments_, state);
  if (bound === undefined) return undefined;
  let result: TargetTypeRef | undefined;
  for (const step of application.conditionalSteps) {
    if (step.branch === "deferred") {
      const declaration = csharpConditionalDeclaration(scope, application);
      if (declaration === undefined ||
        scope.host.ast.typeParameters(declaration).length !== arguments_.length || application.conditionalSteps.length !== 1) return undefined;
      const identity = sourceNodeIdentity(scope.host.ast, declaration);
      const sourceName = scope.host.ast.text(scope.host.ast.name(declaration));
      if (identity === undefined || sourceName.length === 0) return undefined;
      return csharpProjectedType({ kind: "conditional", declaration, identity, sourceName,
        sourceArguments: application.bindings.map(binding => binding.argument), arguments: arguments_ });
    }
    if (step.selectedNode === undefined || step.selectedType === undefined) return undefined;
    const bindings = new Map(bound.sourceBindings);
    for (const binding of step.bindings) {
      const index = application.bindings.findIndex(candidate => candidate.parameter === binding.applicationParameter);
      const sourceType = index < 0 ? binding.argument : application.bindings[index]!.argument;
      const targetType = index < 0
        ? scope.resolveDirectSourceFacts(queries.facts.typeSubjects(sourceType), queries.sourceFile, nextState(bound)) ??
          scope.resolveEvidenceNodesToCommonTarget(
            sourceTransformedTypeFactEvidenceNodes(scope.host.ast, queries, authoredRoot, sourceType),
            sourceType, queries, nextState(bound),
          ) ??
          (queries.types.isNumberLike(sourceType) || queries.types.isBigIntLike(sourceType) ? undefined
            : scope.resolveTypeWithState(sourceType, queries.sourceFile, nextState(bound)))
        : arguments_[index];
      if (targetType === undefined) return undefined;
      for (const declaration of binding.declarations) bindings.set(declaration, { sourceType, targetType });
    }
    if (scope.host.ast.is.IsConditionalTypeNode(step.selectedNode)) continue;
    const selected = scope.resolveNodeWithState(step.selectedNode, scope.host.ast.getSourceFile(step.selectedNode) ?? queries.sourceFile,
      { ...nextState(bound), sourceBindings: bindings });
    if (selected === undefined || result !== undefined && !targetTypeRefEquals(result, selected)) return undefined;
    result = selected;
  }
  return result;
}

export function resolveCsharpSemanticConditionalType(
  scope: CsharpTypeResolutionScope, type: Type, queries: SourceFileSemantics, state: CsharpTypeResolutionState,
): { readonly type: TargetTypeRef | undefined } | undefined {
  let application = queries.types.aliasApplication(type);
  if (application?.kind !== "conditional" || csharpConditionalDeclaration(scope, application) === undefined) return undefined;
  const selectedSources = application.bindings.map(binding => csharpBoundSourceType(binding.argument, queries, state)?.sourceType ?? binding.argument);
  if (selectedSources.some((argument, index) => argument !== application!.bindings[index]!.argument)) {
    const declaration = csharpConditionalDeclaration(scope, application);
    if (declaration === undefined) return { type: undefined };
    application = queries.types.instantiateAlias(declaration, selectedSources);
    if (application === undefined) return { type: undefined };
  }
  const arguments_ = application.bindings.map(binding =>
    csharpBoundSourceType(binding.argument, queries, state)?.targetType ??
    scope.resolveTypeWithState(binding.argument, queries.sourceFile, nextState(state)));
  return { type: arguments_.some(argument => argument === undefined) ? undefined
    : resolveCsharpConditionalApplication(scope, application, arguments_ as readonly TargetTypeRef[], queries, state) };
}

export function csharpConditionalDeclaration(
  scope: CsharpTypeResolutionScope,
  application: TypeAliasApplicationInfo,
): Node | undefined {
  const { ast, navigation } = scope.host;
  let body = application.conditionalSteps[0]?.conditional;
  let declaration = body === undefined ? undefined : ast.parent(body);
  while (declaration !== undefined && ast.is.IsParenthesizedTypeNode(declaration)) {
    body = declaration;
    declaration = ast.parent(body);
  }
  return declaration !== undefined && ast.is.IsTypeAliasDeclaration(declaration) &&
    ast.typeNode(declaration) === body && navigation.isProjectDeclaration(declaration)
    ? declaration : undefined;
}
