import type { Node } from "@tsonic/tsts";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import type { TsonicNativePointerRecord, TsonicNativePointerRejection } from "@tsonic/source-core/facts";
import { csharpSourceCoreAnalyses } from "./source-core.js";

export type CsharpSourceNativePointerOperation = TsonicNativePointerRecord;

/** loadnativeptr / storenativeptr / offsetnativeptr: the source-core Host record (operand roles with descriptors). */
export function readCsharpSourceNativePointerOperation(
  facts: SourceProgramFacts,
  subject: Node,
): CsharpSourceNativePointerOperation | TsonicNativePointerRejection | undefined {
  return csharpSourceCoreAnalyses(facts).pointers.native(subject);
}
