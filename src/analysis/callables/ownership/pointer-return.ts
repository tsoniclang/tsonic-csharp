import type { CsharpPointerReturnContract } from "../../../target-model/records/calls/pointer-return.js";
import type { Node } from "@tsonic/tsts";
import type { CsharpTypeResolutionScope } from "../../source-evidence/types/resolution/scope.js";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import { nextState } from "../../source-evidence/types/resolution/state.js";

import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { csharpRuntimeLocationTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";
import { resolveCsharpPointerStoragePointee } from "../../source-evidence/types/resolution/pointer-storage.js";

export function resolveCsharpPointerReturnContract(
  scope: CsharpTypeResolutionScope,
  declaration: Node,
  state: CsharpTypeResolutionState,
): CsharpPointerReturnContract | undefined {
  const { host } = scope;
  if (host.ast.body(declaration) === undefined || host.ast.hasModifierKind(declaration, "async")) return undefined;
  const queries = host.semanticsFor(declaration);
  if (queries.operations.generator(declaration) !== undefined) return undefined;
  const completion = queries.operations.callableCompletion(declaration);
  if (completion === undefined) return undefined;
  const evidence = host.pointerStorage.returned(declaration, state.sourceStorageBindings);
  if (evidence.kind === "unresolved") return undefined;
  const selections = evidence.producers.map(producer =>
    resolveCsharpPointerStoragePointee(scope, producer.storage, nextState(state)));
  if (evidence.kind === "open") {
    for (const boundary of evidence.boundaries) {
      const checked = host.sourceStorage.typeFor(boundary.subject);
      if (checked.kind === "unresolved") return undefined;
      selections.push(resolveCsharpPointerStoragePointee(scope, {
        subject: boundary.subject, type: checked.type, sourceFile: checked.sourceFile, bindings: boundary.bindings,
      }, nextState(state)));
    }
  }
  const pointees = selections.map(selected => selected.kind === "resolved" ? selected.type : undefined);
  const first = pointees[0];
  if (first === undefined || pointees.some((type) =>
    type === undefined || !targetTypeRefEquals(type, first))) {
    return undefined;
  }
  const present = csharpRuntimeLocationTargetType(first);
  const type = evidence.includesAbsence ? csharpNullableTargetType(present) : present;
  return type === undefined ? undefined : Object.freeze({
    type,
    undefinedReturn: evidence.includesAbsence,
    fallthroughUndefined: evidence.includesAbsence && completion.canFallThrough,
  });
}
