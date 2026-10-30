import type { Node } from "@tsonic/tsts";
import { isAstNode } from "@tsonic/target-api/source";
import type { TsonicAttributeApplicationFactIndex } from "@tsonic/source-core/facts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpOperationIssue } from "../../target-model/records/operations/operations.js";
import type { CsharpSafetyApplicationFactIndex } from "../../target-model/records/storage/safety.js";

export interface CsharpOperationErasureIndexes {
  readonly attributeApplications: TsonicAttributeApplicationFactIndex;
  readonly safetyApplications: Pick<CsharpSafetyApplicationFactIndex, "safetyOperation">;
  readonly nativeErrorNameInitializations: ReadonlySet<Node>;
}

export interface CsharpOperationErasure extends CsharpOperationErasureIndexes {
  readonly demandedInvocations: ReadonlySet<Node>;
  readonly issues: CsharpOperationIssue[];
}

export function createCsharpOperationErasure(
  ast: CsharpPolicyContext["ast"],
  indexes: CsharpOperationErasureIndexes,
  issues: CsharpOperationIssue[],
): CsharpOperationErasure {
  return Object.freeze({
    attributeApplications: indexes.attributeApplications,
    safetyApplications: indexes.safetyApplications,
    nativeErrorNameInitializations: indexes.nativeErrorNameInitializations,
    demandedInvocations: new Set(indexes.attributeApplications.all.flatMap(application =>
      isAstNode(ast, application.invocation) ? [application.invocation] : [])),
    issues,
  });
}

export function csharpErasedExpressionStatement(
  ast: CsharpPolicyContext["ast"],
  statement: Node,
  indexes: CsharpOperationErasureIndexes,
): boolean {
  if (indexes.nativeErrorNameInitializations.has(statement)) return true;
  const expression = ast.as.AsExpressionStatement(statement)?.Expression;
  if (expression === undefined) return false;
  if (indexes.attributeApplications.forSubject(expression) !== undefined) return true;
  const safety = indexes.safetyApplications.safetyOperation.get(expression);
  return safety?.kind === "safety-builder" ||
    safety?.kind === "unsafe-context" && safety.fact.kind === "remaining-block";
}
