import type { Node } from "@tsonic/tsts";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import { csharpSourceCoreAnalyses } from "./source-core.js";

/** keepalive(value): the source-core Host record. */
export function readCsharpSourceKeepAlive(
  facts: SourceProgramFacts,
  subject: Node,
): { readonly call: Node; readonly valueExpression: Node } | undefined {
  const record = csharpSourceCoreAnalyses(facts).memory.keepAlive(subject);
  return record === undefined ? undefined : Object.freeze({ call: record.call, valueExpression: record.value.expression });
}
