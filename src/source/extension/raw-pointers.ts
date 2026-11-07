import { rawPointerOperationFactKey } from "@tsonic/tsts";
import type { Node, ReadonlySourceFactResolver } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import type { CsharpSourceRawPointerIdentity } from "../../target-model/records/storage/raw-pointers.js";

/**
 * equalrawptr / hashrawptr: the Legacy raw-pointer witness carries only the call and its role-named operand nodes
 * (checker-free, K-2662); each operand's type is its Host descriptor.
 */
export function readCsharpSourceRawPointerIdentity(
  facts: SourceProgramFacts,
  sourceFacts: ReadonlySourceFactResolver | undefined,
  subject: Node,
): CsharpSourceRawPointerIdentity | undefined {
  const fact = sourceFacts?.getFact(subject, rawPointerOperationFactKey);
  if (fact === undefined || fact.operation === "bind-raw-pointer") return undefined;
  const typed = (expression: Node) => {
    const outcome = facts.values.type(expression);
    return Object.freeze({ expression, type: outcome.kind === "refused" ? failTargetAnalysisInvariant("tsonic-csharp",
      "A raw-pointer identity operand reached C# analysis with a refused Host type.", expression) : outcome.type });
  };
  return Object.freeze({
    call: fact.call,
    operation: fact.operation,
    arguments: Object.freeze(fact.operation === "equal-raw-pointer"
      ? [typed(fact.leftExpression), typed(fact.rightExpression)] : [typed(fact.pointerExpression)]),
  });
}
