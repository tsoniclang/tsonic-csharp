import type { Node } from "@tsonic/tsts";
import { sourceBindingScope } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { isSourceOwnedProjectReference } from "../../policy/types/resolution/source-ownership.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/nullable.js";
import type { CsharpConversionIssue, CsharpDelegateAdapterIdentity, CsharpExpressionConversionClassification } from "./model.js";

export function sealCsharpDelegateAdapterIdentities(
  policy: CsharpPolicyContext,
  expressions: ReadonlyMap<Node, Map<string, CsharpExpressionConversionClassification>>,
  issues: CsharpConversionIssue[],
): ReadonlyMap<Node, readonly CsharpDelegateAdapterIdentity[]> {
  const groups = new Map<Node, Map<string, { readonly identity: CsharpDelegateAdapterIdentity;
    readonly uses: Map<Node, string> }>>();
  for (const [expression, classifications] of expressions) for (const [key, classification] of classifications) {
    const selection = classification.selection;
    if (!classification.runtimeDemand || selection.kind !== "delegate-adapter" || selection.strategy !== "adaptation") continue;
    const declaration = stableSourceBinding(expression, policy, classification.source);
    const scope = declaration === undefined ? undefined : sourceBindingScope(declaration, policy.ast);
    if (declaration === undefined || scope === undefined || !policy.ast.is.IsBlock(scope) ||
      !withinActivation(expression, scope, policy)) continue;
    const conversions = groups.get(declaration) ?? new Map();
    const group = conversions.get(key) ?? { identity: Object.freeze({ declaration, scope,
      source: classification.source, target: classification.target, selection }), uses: new Map<Node, string>() };
    if (!targetTypeRefEquals(group.identity.source, classification.source) ||
      !targetTypeRefEquals(group.identity.target, classification.target)) continue;
    group.uses.set(expression, key);
    conversions.set(key, group);
    groups.set(declaration, conversions);
  }
  const scopes = new Map<Node, CsharpDelegateAdapterIdentity[]>();
  for (const conversions of groups.values()) for (const group of conversions.values()) {
    if (group.uses.size < 2) continue;
    const identities = scopes.get(group.identity.scope) ?? [];
    identities.push(group.identity);
    scopes.set(group.identity.scope, identities);
    for (const [expression, key] of group.uses) {
      const classifications = expressions.get(expression)!;
      classifications.set(key, Object.freeze({ ...classifications.get(key)!, delegateIdentity: group.identity }));
    }
  }
  for (const [expression, classifications] of expressions) for (const classification of classifications.values()) {
    if (classification.identityRequired && classification.delegateIdentity === undefined) issues.push(Object.freeze({
      node: expression, code: "CSHARP_DELEGATE_IDENTITY_NOT_CLOSED",
      message: "Native event removal with an adapted handler requires the same checked stable binding, exact conversion and lexical activation as its retained adapter.",
    }));
  }
  return new Map([...scopes].map(([scope, identities]) => [scope, Object.freeze(identities)]));
}

function stableSourceBinding(expression: Node, policy: CsharpPolicyContext,
  source: CsharpExpressionConversionClassification["source"]): Node | undefined {
  if (!policy.ast.is.IsIdentifier(expression)) return undefined;
  let reference = policy.navigation.referenceFor(expression);
  const seen = new Set<Node>();
  while (reference !== undefined && isSourceOwnedProjectReference(reference, policy)) {
    const declaration = reference.declaration;
    if (seen.has(declaration) || policy.ast.getSourceFile(declaration) !== reference.sourceFile ||
      policy.navigation.declarationUseSummary(declaration).bindingWritten ||
      !policy.ast.is.IsVariableDeclaration(declaration) && !policy.ast.is.IsParameterDeclaration(declaration)) return undefined;
    seen.add(declaration);
    const initializer = policy.ast.is.IsVariableDeclaration(declaration)
      ? policy.ast.as.AsVariableDeclaration(declaration)?.Initializer : undefined;
    if (initializer === undefined || !policy.ast.is.IsIdentifier(initializer)) return declaration;
    const type = policy.types.resolveNode(initializer, reference.sourceFile);
    if (type === undefined || !targetTypeRefEquals(getCsharpNullableElementTargetType(type) ?? type, source)) return declaration;
    const origin = policy.navigation.referenceFor(initializer);
    if (origin === undefined || !isSourceOwnedProjectReference(origin, policy)) return declaration;
    reference = origin;
  }
  return undefined;
}

function withinActivation(expression: Node, scope: Node, policy: CsharpPolicyContext): boolean {
  for (let current: Node | undefined = expression; current !== undefined; current = policy.ast.parent(current)) {
    if (current === scope) return true;
    if (policy.ast.body(current) !== undefined) return false;
  }
  return false;
}
