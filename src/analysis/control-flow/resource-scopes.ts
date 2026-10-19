import type { AstReader, Node } from "@tsonic/tsts";
import { analyzeSourceResourceScopes } from "@tsonic/target-api/analysis";
import type { CsharpResourceScopeRecords } from "../../target-model/records/resource-scopes.js";
import { createCsharpResourceScopeRecords } from "../program/records/resource-scopes.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/required-records.js";

export function analyzeCsharpResourceScopes(input: {
  readonly ast: AstReader; readonly nodes: readonly Node[]; readonly erased: (node: Node) => boolean;
  readonly required: CsharpRequiredRecord[];
}): CsharpResourceScopeRecords {
  const selected = analyzeSourceResourceScopes(input.ast, input.nodes, input.erased);
  for (const subject of selected.scopes.keys()) requireCsharpRecord(input.required, {
    family: "resourceScope", subject, construct: input.ast.kindName(subject), producer: "analyzeCsharpResourceScopes",
  });
  return createCsharpResourceScopeRecords(selected.scopes);
}
