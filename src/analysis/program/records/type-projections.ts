import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpProjectedType } from "../../../target-model/types/projections.js";
import type { CsharpGenericProjectionIndex } from "../../../target-model/records/type-projections.js";

export function createCsharpTypeProjectionRecords(entries: CsharpGenericProjectionIndex["entries"]): CsharpGenericProjectionIndex {
  const index = new WeakMap<Node, CsharpGenericProjectionIndex["entries"][number]>();
  for (const entry of entries) {
    if (index.has(entry.declaration)) failTargetAnalysisInvariant("tsonic-csharp", "A native generic projection declaration has one record owner.", entry.declaration);
    index.set(entry.declaration, Object.freeze(entry));
  }
  const empty: readonly CsharpProjectedType[] = Object.freeze([]);
  return Object.freeze({ entries: Object.freeze([...entries]),
    genericProjection: Object.freeze({ get: (node: Node) => index.get(node)?.parameters ?? empty }),
    outerGenericProjection: Object.freeze({ get: (node: Node) => index.get(node)?.outerParameters ?? empty }) });
}
