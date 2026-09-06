import type { Node } from "@tsonic/tsts";
import type { CsharpTypeResolutionScope } from "../resolution/engine.js";
import type { CsharpTypeResolutionState } from "../resolution/model.js";
import { nextState } from "../resolution/state.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import {
  combineCsharpTargetUnionMembers,
  csharpRuntimeLocationTargetType,
} from "../../../target-model/types/runtime-carriers.js";

export interface CsharpPointerReturnContract {
  readonly type: TargetTypeRef;
  readonly undefinedReturn: boolean;
  readonly fallthroughUndefined: boolean;
}

export function resolveCsharpPointerReturnContract(
  { host, resolveAuthoredAndSelectedSourceType, resolveTypeWithState }: CsharpTypeResolutionScope,
  declaration: Node,
  state: CsharpTypeResolutionState,
): CsharpPointerReturnContract | undefined {
  const evidence = host.pointerReturns.resolve(declaration);
  if (evidence === undefined) {
    return undefined;
  }
  const pointees = evidence.pointees.map((value) => resolveAuthoredAndSelectedSourceType(
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
