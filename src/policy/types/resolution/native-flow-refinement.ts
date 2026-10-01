import type { Node } from "@tsonic/tsts";
import { selectSourceGuardedValueMembers } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { getCsharpRuntimeUnionArms } from "../../../target-model/types/runtime-carriers.js";
import { selectCsharpClosedTypeTestPlan } from "../../operations/operators/type-tests.js";
import type { CsharpTypePolicyHost } from "./model.js";

export function selectCsharpNativeFlowRefinement(
  host: CsharpTypePolicyHost,
  reference: Node,
  sourceCarrier: TargetTypeRef,
): TargetTypeRef | undefined {
  const members = getCsharpRuntimeUnionArms(sourceCarrier, host.typeDefinitions);
  if (members === undefined) return undefined;
  const selected = selectSourceGuardedValueMembers(host, reference, members,
    expression => host.closedTypeGuard(expression),
    (member, predicate) => {
      const test = selectCsharpClosedTypeTestPlan(member, predicate, undefined, host.typeDefinitions);
      return test?.kind === "constant" ? test.value : undefined;
    });
  return selected?.length === 1 ? selected[0] : undefined;
}
