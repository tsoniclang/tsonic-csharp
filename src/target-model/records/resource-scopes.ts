import type { Node } from "@tsonic/tsts";
import type { SourceResourceScope } from "@tsonic/target-api/analysis";

export interface CsharpResourceScopeRecords {
  readonly resourceScope: { readonly get: (subject: Node | undefined) => SourceResourceScope | undefined };
}
