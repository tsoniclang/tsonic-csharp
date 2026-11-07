import type { Node } from "@tsonic/tsts";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import type { TsonicRawLocationRecord, TsonicRejectedRecord } from "@tsonic/source-core/facts";
import { csharpSourceCoreAnalyses } from "./source-core.js";

/** torawptr / reinterpretrawptr with its finalized layout: the source-core Host record (descriptors, operand roles). */
export function readCsharpRawLocation(facts: SourceProgramFacts, subject: Node): TsonicRawLocationRecord | TsonicRejectedRecord | undefined {
  return csharpSourceCoreAnalyses(facts).memory.rawLocation(subject);
}
