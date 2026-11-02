import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { selectTsonicRawLocationOperation } from "@tsonic/source-core/facts";
import type { TsonicPointerStorageRelation } from "@tsonic/source-core/facts";
import type { CsharpPointerBackingProducer, CsharpPointerBackingUse } from "../../target-model/records/storage/pointer-backing.js";
import type { CsharpTypeQueries } from "../../policy/model/type-resolution.js";

export function createCsharpPointerBackingDemands(
  source: TargetSourceProgram,
  storage: TsonicPointerStorageRelation,
  types: CsharpTypeQueries,
) {
  const uses: CsharpPointerBackingUse[] = [];
  const issues: { readonly node: Node; readonly reason: string }[] = [];
  return Object.freeze({
    uses: () => Object.freeze([...uses]),
    issues: () => Object.freeze([...issues]),
    record(node: Node): void {
      if (!source.ast.is.IsCallExpression(node)) return;
      const selected = selectTsonicRawLocationOperation(source.ast, source.sourceFacts, node);
      if (selected === undefined) return;
      if (selected.kind === "rejected") {
        issues.push(Object.freeze({ node, reason: selected.reason }));
        return;
      }
      if (selected.operation.operation !== "to-raw") return;
      const backing = storage.value(selected.expression);
      if (backing.kind === "unresolved") {
        issues.push(...backing.issues);
        return;
      }
      if (backing.kind === "open") {
        for (const boundary of backing.boundaries) issues.push(Object.freeze({
          node: boundary.exposure,
          reason: `Physical pointer backing requires a closed source storage domain (${boundary.kind}).`,
        }));
        return;
      }
      const producers: CsharpPointerBackingProducer[] = [];
      for (const producer of backing.producers) {
        const pointee = types.resolvePointerStoragePointee(producer);
        if (pointee.kind === "unresolved") issues.push(Object.freeze({
          node: producer.operation.call, reason: pointee.reason,
        }));
        else producers.push(Object.freeze({ source: producer, pointeeType: pointee.type }));
      }
      if (producers.length !== backing.producers.length) return;
      uses.push(Object.freeze({
        call: node,
        producers: Object.freeze(producers),
        includesAbsence: backing.includesAbsence,
        layout: selected.layout,
      }));
    },
  });
}
