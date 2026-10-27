import type { Node } from "@tsonic/tsts";
import type { SourceResourceScope } from "@tsonic/target-api/analysis";
import type { CsharpResourceScopeRecords } from "../../../../target-model/records/storage/resource-scopes.js";

export function createCsharpResourceScopeRecords(scopes: ReadonlyMap<Node, SourceResourceScope>): CsharpResourceScopeRecords {
  return Object.freeze({ resourceScope: Object.freeze({
    get: (subject: Node | undefined) => subject === undefined ? undefined : scopes.get(subject),
  }) });
}
