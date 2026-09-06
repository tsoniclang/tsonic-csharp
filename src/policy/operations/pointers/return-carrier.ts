import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { TsonicPointerReturnQueries } from "@tsonic/source-core/facts";
import type { CsharpTypePolicy } from "../../types/index.js";
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

export function selectCsharpPointerReturnContract(
  declaration: Node,
  source: TargetSourceProgram,
  types: CsharpTypePolicy,
  returns: TsonicPointerReturnQueries,
): CsharpPointerReturnContract | undefined {
  const evidence = returns.resolve(declaration);
  if (evidence === undefined) {
    return undefined;
  }
  const pointees = evidence.pointees.map((value) => types.resolveSelectedType(
    value.typeNode,
    value.type,
    source.ast.getSourceFile(value.subject)!,
  ));
  const first = pointees[0];
  if (first === undefined || pointees.some((type) =>
    type === undefined || !targetTypeRefEquals(type, first))) {
    return undefined;
  }
  const nullish = evidence.nullishTypes.map((type) =>
    types.resolveType(type, source.ast.getSourceFile(declaration)!));
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
