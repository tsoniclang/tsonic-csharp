import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef, CsharpOptionalStorageLayout } from "../../../target-model/types/native-type-data.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import type { CsharpRepresentationHost } from "./representation-host.js";
import { selectCsharpOptionalStorage } from "../../../target-model/types/optional-storage.js";
import { acquireCsharpOptionalStorageDefinitions } from "./optional-definitions.js";
import { represented } from "./representation-results.js";

export function representCsharpOptionalStorage(host: Pick<CsharpRepresentationHost, "providers">,
  payload: TargetTypeRef, site: Node): Exclude<CsharpRepresentationOutcome<CsharpOptionalStorageLayout>, { readonly kind: "source-refused" }> {
  const definitions = acquireCsharpOptionalStorageDefinitions(host, site);
  return definitions.kind !== "represented" ? definitions : represented(selectCsharpOptionalStorage(payload, definitions.value));
}
