// Call-only aliases of JS source-profile callables (`const log = console.log; log(x)`). The Host navigation
// publishes the alias (const binding, value flow, every use a call that selects one of the overloads:
// facts.analyses.callOnlyAlias, SourceAnalysisFacts by B2); C# keeps only aliases whose selected declaration is a
// source-profile function or a member of an uninitialized profile variable.
import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgramFacts } from "@tsonic/target-api/source";
import { isTsonicSourceProfileDeclarationPath } from "@tsonic/target-api/provider";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import { csharpSourceProfileDeclarationIdentity } from "../../../policy/identities/selected-source.js";

/** A call-only alias C# lowers to direct profile calls: declarations and nodes only (I2). */
export interface CsharpCallOnlyAlias {
  /** The aliased value expression (identifier or member access). */
  readonly expression: Node;
  /** The selected callable declaration. */
  readonly selectedDeclaration: Node;
  /** The member access node when the alias names a member (`obj.method`). */
  readonly member?: Node;
  readonly receiverDeclaration?: Node;
  /** Every overload declaration of the aliased callable, authored order. */
  readonly declarations: readonly Node[];
  /** Every call through the alias. */
  readonly calls: readonly Node[];
}

export function createCsharpSourceProfileCallableAliasQuery(source: TargetSourceProgramFacts):
  (declaration: Node) => CsharpCallOnlyAlias | undefined {
  const select = (declaration: Node) => source.facts.analyses.callOnlyAlias(declaration);
  const policy = { ast: source.syntax, facts: source.facts, sourceFacts: source.sourceFacts };
  return declaration => {
    const alias = select(declaration);
    return alias !== undefined && acceptsSourceProfileAlias(alias, policy) ? Object.freeze({
      expression: alias.expression, selectedDeclaration: alias.selectedDeclaration,
      ...(alias.member === undefined ? {} : { member: alias.member }),
      ...(alias.receiverDeclaration === undefined ? {} : { receiverDeclaration: alias.receiverDeclaration }),
      declarations: alias.declarations, calls: alias.calls,
    }) : undefined;
  };
}

function acceptsSourceProfileAlias(
  alias: CsharpCallOnlyAlias,
  policy: Pick<CsharpPolicyContext, "ast" | "facts" | "sourceFacts">,
): boolean {
  const identity = csharpSourceProfileDeclarationIdentity(
    policy.ast, policy.facts, policy.sourceFacts, alias.selectedDeclaration,
  );
  if (identity === undefined) return false;
  if (alias.member === undefined) return policy.ast.is.IsFunctionDeclaration(alias.selectedDeclaration);
  const receiver = alias.receiverDeclaration;
  const file = receiver === undefined ? undefined : policy.ast.getSourceFile(receiver);
  return receiver !== undefined && file !== undefined && policy.ast.is.IsVariableDeclaration(receiver) &&
    policy.ast.as.AsVariableDeclaration(receiver)?.Initializer === undefined &&
    isTsonicSourceProfileDeclarationPath(policy.ast.getFileName(file), identity.owner);
}
