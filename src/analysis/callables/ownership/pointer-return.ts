import type { CsharpPointerReturnContract } from "../../../target-model/records/calls/pointer-return.js";
import type { AstReader, Node } from "@tsonic/tsts";
import type { TsonicPointerStorageRelation } from "@tsonic/source-core/facts";
import type { SourceStorageProducer, SourceStorageQueries } from "@tsonic/target-api/analysis";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import type { CsharpPointerStoragePointeeSelection } from "../../../target-model/records/storage/pointer-storage.js";

import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { csharpRuntimeLocationTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";

export interface CsharpPointerReturnHost {
  readonly ast: AstReader;
  readonly facts: SourceProgramFacts;
  readonly pointerStorage: TsonicPointerStorageRelation;
  readonly sourceStorage: Pick<SourceStorageQueries, "typeFor">;
  /** The native pointee of one returned storage producer (CsharpTypeQueries.resolvePointerStoragePointee). */
  resolvePointee(producer: SourceStorageProducer): CsharpPointerStoragePointeeSelection;
}

/**
 * The native pointer-return contract of a synchronous, non-generator callable whose every return produces one
 * pointer storage of one exact pointee. Completion (fall-through) comes from the published completion selection.
 */
export function resolveCsharpPointerReturnContract(
  host: CsharpPointerReturnHost,
  declaration: Node,
): CsharpPointerReturnContract | undefined {
  if (host.ast.body(declaration) === undefined || host.ast.hasModifierKind(declaration, "async")) return undefined;
  if (host.facts.selections.generator(declaration) !== undefined) return undefined;
  const completion = host.facts.selections.completion(declaration);
  if (completion === undefined) return undefined;
  const evidence = host.pointerStorage.returned(declaration);
  if (evidence.kind === "unresolved") return undefined;
  const selections = evidence.producers.map(producer => host.resolvePointee(producer.storage));
  if (evidence.kind === "open") {
    for (const boundary of evidence.boundaries) {
      const checked = host.sourceStorage.typeFor(boundary.subject);
      if (checked.kind === "unresolved") return undefined;
      selections.push(host.resolvePointee({
        subject: boundary.subject, type: checked.type, sourceFile: checked.sourceFile, bindings: boundary.bindings,
      }));
    }
  }
  const pointees = selections.map(selected => selected.kind === "resolved" ? selected.type : undefined);
  const first = pointees[0];
  if (first === undefined || pointees.some((type) =>
    type === undefined || !targetTypeRefEquals(type, first))) {
    return undefined;
  }
  const location = csharpRuntimeLocationTargetType(first);
  return Object.freeze({
    type: evidence.includesAbsence ? csharpNullableTargetType(location) : location,
    undefinedReturn: evidence.includesAbsence,
    fallthroughUndefined: evidence.includesAbsence && completion.canFallThrough,
  });
}
