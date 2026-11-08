import type { Node } from "@tsonic/tsts";
import type { CsharpSourceAttributeApplicationIndex } from "../attributes/model.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpOperationIssue } from "../../target-model/records/operations/operations.js";
import type { CsharpSafetyApplicationFactIndex } from "../../target-model/records/storage/safety.js";

export interface CsharpOperationErasureIndexes {
  readonly errorNameInitializations: ReadonlySet<Node>;
  readonly attributeApplications: CsharpSourceAttributeApplicationIndex;
  readonly safetyApplications: Pick<CsharpSafetyApplicationFactIndex, "safetyOperation">;
}

export interface CsharpOperationErasure extends CsharpOperationErasureIndexes {
  readonly demandedInvocations: ReadonlySet<Node>;
  readonly issues: CsharpOperationIssue[];
}

export function createCsharpOperationErasure(
  _ast: CsharpPolicyContext["ast"],
  indexes: CsharpOperationErasureIndexes,
  issues: CsharpOperationIssue[],
): CsharpOperationErasure {
  return Object.freeze({
    errorNameInitializations: indexes.errorNameInitializations,
    attributeApplications: indexes.attributeApplications,
    safetyApplications: indexes.safetyApplications,
    demandedInvocations: new Set(indexes.attributeApplications.all.map(application => application.invocation)),
    issues,
  });
}

export function csharpErasedExpressionStatement(
  ast: CsharpPolicyContext["ast"],
  statement: Node,
  indexes: CsharpOperationErasureIndexes,
): boolean {
  if (indexes.errorNameInitializations.has(statement)) return true;
  const expression = ast.as.AsExpressionStatement(statement)?.Expression;
  if (expression === undefined) return false;
  if (indexes.attributeApplications.forSubject(expression) !== undefined) return true;
  const safety = indexes.safetyApplications.safetyOperation.get(expression);
  return safety?.kind === "safety-builder" ||
    safety?.kind === "unsafe-context" && safety.fact.kind === "remaining-block";
}
