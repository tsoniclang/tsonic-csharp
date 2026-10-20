import type { CsharpPointerReturnContract } from "../../target-model/records/pointer-return.js";
import type { Node } from "@tsonic/tsts";
import type { CsharpTypeResolutionScope } from "../../policy/types/resolution/engine.js";
import type { CsharpTypeResolutionState } from "../../policy/types/resolution/model.js";
import { nextState } from "../../policy/types/resolution/state.js";

import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { combineCsharpTargetUnionMembers, csharpRuntimeLocationTargetType, csharpRuntimeLocationPointee } from "../../target-model/types/carriers/runtime-carriers.js";

export function resolveCsharpPointerReturnContract(
  { host, resolveAuthoredAndSelectedSourceType, resolveDirectSourceFacts, resolveTypeWithState }: CsharpTypeResolutionScope,
  declaration: Node,
  state: CsharpTypeResolutionState,
): CsharpPointerReturnContract | undefined {
  const evidence = host.pointerReturns.resolve(declaration);
  if (evidence === undefined) {
    return undefined;
  }
  const pointees = evidence.pointees.map((value) => csharpRuntimeLocationPointee(
    resolveDirectSourceFacts([value.subject], host.ast.getSourceFile(value.subject)!, nextState(state)),
  ) ?? resolveAuthoredAndSelectedSourceType(
    value.typeNode,
    host.ast.getSourceFile(value.typeNode ?? value.subject)!,
    value.type,
    host.ast.getSourceFile(value.subject)!,
    nextState(state),
  ));
  const first = pointees[0];
  if (first === undefined || pointees.some((type) =>
    type === undefined || !targetTypeRefEquals(type, first))) {
    return undefined;
  }
  const nullish = evidence.nullishTypes.map((type) =>
    resolveTypeWithState(type, host.ast.getSourceFile(declaration)!, nextState(state)));
  if (nullish.some((type) => type === undefined)) {
    return undefined;
  }
  const type = combineCsharpTargetUnionMembers([
    csharpRuntimeLocationTargetType(first),
    ...nullish.filter((type) => type !== undefined),
  ]);
  return type === undefined ? undefined : Object.freeze({
    type,
    undefinedReturn: nullish.length > 0,
    fallthroughUndefined: nullish.length > 0 && evidence.completion.canFallThrough,
  });
}
