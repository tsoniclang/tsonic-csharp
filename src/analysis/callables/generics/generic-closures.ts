import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/program/source-evidence.js";
import type { CsharpStorageIssue } from "../../../target-model/records/storage/storage.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import type { CsharpFrameClosure, CsharpNativeClosureCapture } from "../../../target-model/records/callables/capture-storage.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";

const maximumGenericClosureCaptures = 131_072;

export function selectCsharpGenericFrameClosures(
  source: TargetSourceProgram,
  evidence: CsharpSourceEvidenceIndex,
  captures: readonly CsharpNativeClosureCapture[],
  groups: Map<Node, Map<Node, TargetTypeRef>>,
  issues: CsharpStorageIssue[],
): readonly CsharpFrameClosure[] {
  const selected: CsharpFrameClosure[] = [];
  const stagedGroups = new Map([...groups].map(([scope, bindings]) => [scope, new Map(bindings)]));
  let capturesCount = 0;
  for (const capture of captures) {
    const node = capture.owner;
    if (!source.ast.is.IsArrowFunction(node) && !source.ast.is.IsFunctionExpression(node)) continue;
    const type = evidence.contextualType.get(node)?.targetType ?? capture.type;
    const method = getCsharpMethodValue(type);
    if (source.ast.typeParameters(node).length === 0 && method === undefined) continue;
    if (method === undefined) {
      issues.push({ node, code: "CSHARP_GENERIC_CALLABLE_CONTRACT_NOT_CLOSED",
        message: "A generic callable value requires its exact quantified native invocation contract." });
      continue;
    }
    capturesCount += capture.values.length + capture.receivers.length + 1;
    if (capturesCount > maximumGenericClosureCaptures) {
      issues.push({ node, code: "CSHARP_GENERIC_CALLABLE_CAPTURE_LIMIT_EXCEEDED",
        message: `Generic callable capture analysis exceeds its ${maximumGenericClosureCaptures}-entry budget.` });
      return Object.freeze([]);
    }
    let valid = true;
    for (const place of capture.values) {
      if (!place.mutable && place.initialization !== "deferred") continue;
      const group = stagedGroups.get(place.scope) ?? new Map<Node, TargetTypeRef>();
      const previous = group.get(place.declaration);
      if (previous !== undefined && !targetTypeRefEquals(previous, place.type)) {
        issues.push({ node: place.declaration, code: "CSHARP_CAPTURE_STORAGE_CONFLICT",
          message: "One captured binding cannot have incompatible physical storage contracts." });
        valid = false;
        continue;
      }
      group.set(place.declaration, place.type);
      stagedGroups.set(place.scope, group);
    }
    if (valid) selected.push(Object.freeze({ declaration: node, scope: node, methodName: method.method, type,
      captures: Object.freeze(capture.values.map(place => place.declaration)), receivers: capture.receivers }));
  }
  for (const [scope, bindings] of stagedGroups) groups.set(scope, bindings);
  return Object.freeze(selected);
}
