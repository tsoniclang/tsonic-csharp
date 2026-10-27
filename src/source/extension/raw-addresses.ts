import type { CsharpSourceRawAddressOperation } from "../../target-model/records/storage/raw-addresses.js";
import type { ExtensionFactSubject, ReadonlySourceFactResolver } from "@tsonic/tsts";
import { readTsonicRawMemoryOperation } from "@tsonic/source-core/facts";

export function readCsharpSourceRawAddress(
  facts: ReadonlySourceFactResolver | undefined,
  subject: ExtensionFactSubject | undefined,
): CsharpSourceRawAddressOperation | undefined {
  const fact = facts === undefined ? undefined : readTsonicRawMemoryOperation(facts, subject);
  return fact?.operation === "byte-offset" || fact?.operation === "raw-to-address-integer" ||
    fact?.operation === "address-integer-to-raw" ? fact : undefined;
}
