import type { Node } from "@tsonic/tsts";
import { selectSourceGuardedValueMembers, selectSourceNativeValueGuard, type SourceNativeGuard } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpUnionLeaves } from "../../../target-model/types/union-relations.js";
import { getCsharpTypeofRuntimeKind } from "../../../target-model/types/runtime-kind.js";
import { getCsharpJsArrayElementTargetType } from "../../../target-model/types/collections.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import type { CsharpClosedTypePredicate } from "../../../target-model/operations/type-tests.js";
import { selectCsharpClosedTypeTestPlan } from "../../operations/operators/type-tests.js";
import type { CsharpTypePolicyHost } from "./model.js";

export function selectCsharpNativeFlowMembers(
  host: CsharpTypePolicyHost,
  reference: Node,
  sourceCarrier: TargetTypeRef,
): readonly TargetTypeRef[] | undefined {
  const members = csharpUnionLeaves(sourceCarrier, host.typeDefinitions)?.map(member => member.carrier);
  if (members === undefined) return undefined;
  type Predicate = CsharpClosedTypePredicate | { readonly kind: "typeof"; readonly value: string; readonly negated: boolean };
  return selectSourceGuardedValueMembers(host, reference, members,
    (expression): SourceNativeGuard<Predicate> | undefined => {
      const native = selectSourceNativeValueGuard(host, expression);
      if (native?.kind === "typeof") return { sourceOperand: native.sourceOperand, predicate: native };
      if (native?.kind === "nominal") {
        const targetCarrier = host.projectTypeCatalog.targetTypeForDeclaration(native.declaration, []);
        if (targetCarrier !== undefined) return { sourceOperand: native.sourceOperand, predicate: { kind: "nominal", targetCarrier } };
      }
      return host.closedTypeGuard(expression);
    },
    (member, predicate) => {
      const category = getCsharpTypeofRuntimeKind(member, host.typeDefinitions);
      if (predicate.kind === "typeof") return category === undefined ? undefined : (category === predicate.value) !== predicate.negated;
      if (predicate.kind === "nominal") {
        if (targetTypeRefEquals(member, predicate.targetCarrier)) return true;
        if (member.kind === "array" || getCsharpJsArrayElementTargetType(member) !== undefined ||
          category !== undefined && category !== "object") return false;
      }
      const test = selectCsharpClosedTypeTestPlan(member, predicate, undefined, host.typeDefinitions);
      return test?.kind === "constant" ? test.value : undefined;
    });
}
