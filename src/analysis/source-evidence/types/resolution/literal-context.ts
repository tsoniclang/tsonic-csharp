import type { Node } from "@tsonic/tsts";
import { isSourceCallableBodyBoundary, sourceExpressionCallArgument, type SourceClosedCallableArgument, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { nextState } from "./state.js";
import { getCsharpCallableValueSignature, getCsharpTaskResultTargetType } from "../../../../target-model/types/carriers/delegates.js";
import { selectCsharpArrayLiteralCarrier } from "../../../../policy/types/collections/literal-construction.js";
import { csharpFreeTypeParameterIdentities } from "../../../../target-model/types/generic-references.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";

export function resolveCsharpDeclaredLiteralContext(
  scope: CsharpTypeResolutionScope,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): { readonly kind: "selected"; readonly type: TargetTypeRef | undefined } | { readonly kind: "unavailable" } {
  const { host } = scope;
  const argument = sourceExpressionCallArgument(node, { ast: host.ast, semantics: { forNode: host.semanticsFor } });
  if (argument !== undefined) {
    const type = argumentType(argument, new Set([argument.argumentIndex]));
    return type === undefined ? { kind: "unavailable" } : { kind: "selected", type };
  }
  const context = queries.types.contextualValueSelection(node);
  if (context.kind === "selected") return { kind: "selected",
    type: scope.resolveSourceTypeComponentEvidence(context.component, queries, nextState(state)) };
  if (!host.ast.is.IsArrayLiteralExpression(node)) return { kind: "unavailable" };
  const flow = host.navigation.expressionValueFlow(node);
  const uses = flow.uses.filter(use => !use.throughMember && use.kind !== "type-only");
  const arguments_ = new Map<Node, { readonly selected: SourceClosedCallableArgument; readonly returned: boolean }>();
  const declarations = new Set<Node>();
  for (const use of uses) {
    if (use.role === "argument") {
      const selected = sourceExpressionCallArgument(use.reference, { ast: host.ast, semantics: { forNode: host.semanticsFor } });
      if (selected !== undefined) arguments_.set(selected.argument, { selected, returned: false });
    } else if (use.role === "return") {
      for (let owner = host.ast.parent(use.reference); owner !== undefined; owner = host.ast.parent(owner)) {
        if (!isSourceCallableBodyBoundary(host.ast, owner)) continue;
        declarations.add(owner);
        if (host.ast.typeNode(owner) === undefined) {
          const selected = sourceExpressionCallArgument(owner, { ast: host.ast, semantics: { forNode: host.semanticsFor } });
          if (selected !== undefined) arguments_.set(selected.argument, { selected, returned: true });
        }
        break;
      }
    }
  }
  for (const declaration of [...flow.aliasDeclarations, ...declarations]) {
    const annotation = host.ast.typeNode(declaration);
    let selected = annotation === undefined ? undefined
      : scope.resolveNodeWithState(annotation, host.ast.getSourceFile(annotation), nextState(state));
    if (annotation === undefined && declarations.has(declaration)) {
      const queries = host.semanticsFor(declaration);
      const contextual = queries.types.contextualValueSelection(declaration);
      if (contextual.kind === "selected" && contextual.component.authoredTypeNode !== undefined &&
        contextual.component.contextualCall === undefined) {
        const callable = scope.resolveSourceTypeComponentEvidence(contextual.component, queries, nextState(state));
        selected = getCsharpCallableValueSignature(callable)?.returnType;
      }
    }
    if (declarations.has(declaration) && host.ast.hasModifierKind(declaration, "async")) {
      selected = getCsharpTaskResultTargetType(selected);
    }
    if (selected !== undefined && selectCsharpArrayLiteralCarrier(selected, undefined, host.typeDefinitions) !== undefined)
      return { kind: "selected", type: selected };
  }
  for (const { selected, returned } of arguments_.values()) {
    const excluded = new Set([...arguments_.values()].filter(argument => argument.selected.call === selected.call)
      .map(argument => argument.selected.argumentIndex));
    const type = argumentType(selected, excluded);
    const carrier = returned ? getCsharpCallableValueSignature(type)?.returnType : type;
    if (carrier !== undefined && selectCsharpArrayLiteralCarrier(carrier, undefined, host.typeDefinitions) !== undefined)
      return { kind: "selected", type: carrier };
  }
  return { kind: "unavailable" };

  function argumentType(selected: SourceClosedCallableArgument, excluded: ReadonlySet<number>): TargetTypeRef | undefined {
    const callQueries = host.semanticsFor(selected.call);
    const call = callQueries.operations.call(selected.call);
    const bindings = call?.sourceArgumentBindings.filter(binding =>
      binding.sourceForm === "value" && binding.sourceArgumentIndex === selected.argumentIndex);
    const binding = bindings?.length === 1 ? bindings[0] : undefined;
    if (call === undefined || binding === undefined) return undefined;
    const type = scope.resolveSourceCallArgumentParameter(call, binding, callQueries.sourceFile, excluded);
    return type === undefined || !independent(call, type) ? undefined : type;
  }

  function independent(call: ResolvedSourceCallInfo, type: TargetTypeRef): boolean {
    const free = csharpFreeTypeParameterIdentities([type]);
    if (free.size === 0) return true;
    const queries = host.semanticsFor(call.call);
    return (call.sourceSelectedMethodTypeArguments ?? []).every(argument => {
      if (argument.explicitTypeNode !== undefined) return true;
      const symbol = queries.declarations.typeSymbol(argument.typeParameter);
      const declarations = symbol === undefined ? [] : queries.declarations.symbolDeclarations(symbol);
      if (declarations.length === 0) return false;
      return declarations.every(declaration => {
        const parameter = declaration === undefined ? undefined : csharpSourceTypeParameter(declaration, host.ast);
        return parameter !== undefined && !free.has(parameter.identity);
      });
    });
  }
}
