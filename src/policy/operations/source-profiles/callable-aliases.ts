import { createSourceCallOnlyAliasQuery } from "@tsonic/target-api/source";
import type { SourceCallOnlyAlias, TargetSourceProgram } from "@tsonic/target-api/source";
import { isTsonicSourceProfileDeclarationPath } from "@tsonic/target-api/provider";
import type { CsharpPolicyContext } from "../../model/context.js";
import { csharpSourceProfileDeclarationIdentity } from "./source-profile-identity.js";

export function createCsharpSourceProfileCallableAliasQuery(source: TargetSourceProgram):
  (declaration: import("@tsonic/tsts").Node) => SourceCallOnlyAlias | undefined {
  const select = createSourceCallOnlyAliasQuery(source);
  const policy = { ast: source.ast, semanticsFor: source.semantics.forNode, sourceFacts: source.sourceFacts };
  return declaration => {
    const alias = select(declaration);
    return acceptsSourceProfileAlias(alias, policy) ? alias : undefined;
  };
}

function acceptsSourceProfileAlias(
  alias: SourceCallOnlyAlias | undefined,
  policy: Pick<CsharpPolicyContext, "ast" | "semanticsFor" | "sourceFacts">,
): boolean {
  if (alias === undefined) return false;
  const identity = csharpSourceProfileDeclarationIdentity(
    policy.ast, policy.semanticsFor(alias.expression), policy.sourceFacts, alias.selectedDeclaration,
  );
  if (identity === undefined) return false;
  if (alias.property === undefined) return policy.ast.is.IsFunctionDeclaration(alias.selectedDeclaration);
  const receiver = alias.property.receiver.declaration;
  const file = receiver === undefined ? undefined : policy.ast.getSourceFile(receiver);
  return receiver !== undefined && file !== undefined && policy.ast.is.IsVariableDeclaration(receiver) &&
    policy.ast.as.AsVariableDeclaration(receiver)?.Initializer === undefined &&
    isTsonicSourceProfileDeclarationPath(policy.ast.getFileName(file), identity.owner);
}
