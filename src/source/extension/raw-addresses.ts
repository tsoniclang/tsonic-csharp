import type { CsharpSourceRawAddressOperation } from "../../target-model/records/storage/raw-addresses.js";
import type { Node } from "@tsonic/tsts";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import type { TsonicRawAddressRejection } from "@tsonic/source-core/facts";
import { csharpSourceCoreAnalyses } from "./source-core.js";

/** Raw address arithmetic (offsetrawptr, rawptrtoaddressinteger, addressintegertorawptr): the source-core Host record. */
export function readCsharpSourceRawAddress(
  facts: SourceProgramFacts,
  subject: Node,
): CsharpSourceRawAddressOperation | TsonicRawAddressRejection | undefined {
  return csharpSourceCoreAnalyses(facts).memory.rawAddress(subject);
}
