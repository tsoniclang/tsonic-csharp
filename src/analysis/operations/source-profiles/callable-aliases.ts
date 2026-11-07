// Call-only aliases of JS source-profile callables (`const log = console.log; log(x)`). The Host navigation
// publishes the alias (const binding, value flow, every use a call that selects one of the overloads:
// facts.analyses.callOnlyAlias, SourceAnalysisFacts by B2); C# keeps only aliases whose selected declaration is a
// source-profile function or a member of an uninitialized profile variable.
import type { Node } from "@tsonic/tsts";
import type { SourceCallOnlyAliasRecord, TargetSourceProgramFacts } from "@tsonic/target-api/source";
import { isTsonicSourceProfileDeclarationPath } from "@tsonic/target-api/provider";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import { csharpSourceProfileDeclarationIdentity } from "../../../policy/identities/selected-source.js";

/** The Host call-only alias records C# lowers to direct profile calls (declarations and nodes only, I2). */
export function createCsharpSourceProfileCallableAliasQuery(source: TargetSourceProgramFacts):
  (declaration: Node) => SourceCallOnlyAliasRecord | undefined {
  const policy = { ast: source.syntax, facts: source.facts };
  return declaration => {
    const alias = source.facts.analyses.callOnlyAlias(declaration);
    return alias !== undefined && acceptsSourceProfileAlias(alias, policy) ? alias : undefined;
  };
}

function acceptsSourceProfileAlias(
  alias: SourceCallOnlyAliasRecord,
  policy: Pick<CsharpPolicyContext, "ast" | "facts">,
): boolean {
  const identity = csharpSourceProfileDeclarationIdentity(
    policy.ast, policy.facts, alias.selectedDeclaration,
  );
  if (identity === undefined) return false;
  if (alias.member === undefined) return policy.ast.is.IsFunctionDeclaration(alias.selectedDeclaration);
  const receiver = alias.receiverDeclaration;
  const file = receiver === undefined ? undefined : policy.ast.getSourceFile(receiver);
  return receiver !== undefined && file !== undefined && policy.ast.is.IsVariableDeclaration(receiver) &&
    policy.ast.as.AsVariableDeclaration(receiver)?.Initializer === undefined &&
    isTsonicSourceProfileDeclarationPath(policy.ast.getFileName(file), identity.owner);
}
