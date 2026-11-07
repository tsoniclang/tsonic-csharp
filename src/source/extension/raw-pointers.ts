import type { Node } from "@tsonic/tsts";
import { tsonicCoreAnalysisKey } from "@tsonic/source-core/facts";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import type { CsharpSourceRawPointerIdentity } from "../../target-model/records/storage/raw-pointers.js";

/**
 * equalrawptr / hashrawptr: the source-core Host record of a raw-pointer identity call (the call, its operation and
 * its role-ordered operands with their Host descriptors), read through the source-core extension analyses like every
 * other memory and pointer witness (C# never reads the Legacy source-core witness facts; request FX-CC-C1 to FX-CORE).
 * undefined for any other call.
 */
export function readCsharpSourceRawPointerIdentity(
  facts: SourceProgramFacts,
  subject: Node,
): CsharpSourceRawPointerIdentity | undefined {
  return facts.analyses.extension(tsonicCoreAnalysisKey).rawPointerIdentity(subject);
}
