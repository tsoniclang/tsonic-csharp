import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { jsRegExpSourceProfileIdentity } from "@tsonic/js-source-profile";
import type { Node } from "@tsonic/tsts";
import { csharpSourceProfileDeclarationIdentity } from "../../../../policy/identities/selected-source.js";

/**
 * The receiver is a regular-expression literal or `new RegExp(...)` (Host-selected profile constructor), directly or
 * through an unwritten, non-escaping local whose initializer is one (Host value-flow facts).
 */
export function csharpRegExpReceiverHasNativeExecution(
  receiver: Node,
  context: { readonly host: import("../../../../policy/model/provider-calls.js").CsharpProviderCallSelectionHost },
): boolean {
  const { ast, facts } = context.host;
  let origin = receiver;
  while (ast.is.IsParenthesizedExpression(origin)) {
    const inner = ast.as.AsParenthesizedExpression(origin)?.Expression;
    if (inner === undefined) return false;
    origin = inner;
  }
  if (ast.is.IsIdentifier(origin)) {
    const declaration = facts.navigation.identity.target(origin)?.declaration;
    const initializer = declaration === undefined || !ast.is.IsVariableDeclaration(declaration)
      ? undefined : ast.as.AsVariableDeclaration(declaration)?.Initializer;
    if (initializer === undefined || facts.navigation.uses.summary(declaration!).bindingWritten) return false;
    const flow = facts.navigation.expressions.valueFlow(initializer);
    if (flow.escapes || flow.hasUnclassifiedUse || flow.memberWritten || flow.bindingAliased) return false;
    origin = initializer;
  }
  if (ast.kindName(origin) === "KindRegularExpressionLiteral") return true;
  if (!ast.is.IsNewExpression(origin)) return false;
  const selected = facts.selections.call(origin);
  if (selected !== undefined && selected.kind === "refused") return failTargetAnalysisInvariant("tsonic-csharp",
    `A Host call-selection refusal (${selected.code}) reached C# analysis; Host refusals are forwarded before C# analysis.`, origin);
  const identity = selected === undefined ? undefined : csharpSourceProfileDeclarationIdentity(ast, facts, selected.signature);
  return identity?.owner === "js" && identity.kind === "construct" &&
    identity.declaringName === jsRegExpSourceProfileIdentity.owners.regExpConstructor;
}
