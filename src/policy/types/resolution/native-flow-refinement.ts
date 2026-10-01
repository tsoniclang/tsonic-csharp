import type { Node, Type } from "@tsonic/tsts";
import { selectSourceGuardedValueMembers, selectSourceGuardedTypeMembers, selectSourceNativeValueGuard, type SourceNativeGuard, type SourceNativeValueGuard } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpUnionLeaves } from "../../../target-model/types/union-relations.js";
import { getCsharpTypeofRuntimeKind } from "../../../target-model/types/runtime-kind.js";
import { getCsharpJsArrayElementTargetType } from "../../../target-model/types/collections.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import type { CsharpClosedTypePredicate } from "../../../target-model/operations/type-tests.js";
import { selectCsharpClosedTypeTestPlan } from "../../operations/operators/type-tests.js";
import type { CsharpTypePolicyHost } from "./model.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { csharpAbsenceTargetType } from "../../../target-model/types/runtime-carriers.js";

export function selectCsharpNativeFlowMembers(
  host: CsharpTypePolicyHost,
  reference: Node,
  sourceCarrier: TargetTypeRef,
  resolveNominal: (guard: Extract<SourceNativeValueGuard, { readonly kind: "nominal" }>) => TargetTypeRef | undefined,
): readonly TargetTypeRef[] | undefined {
  const present = getCsharpNullableElementTargetType(sourceCarrier) ?? sourceCarrier;
  const payloads = csharpUnionLeaves(present, host.typeDefinitions)?.map(member => member.carrier) ??
    (present === sourceCarrier ? undefined : [present]);
  const members = payloads === undefined ? undefined : present === sourceCarrier ? payloads
    : [...payloads, csharpAbsenceTargetType()];
  if (members === undefined) return undefined;
  return selectSourceGuardedValueMembers(host, reference, members,
    expression => selectNativeGuard(host, expression, resolveNominal),
    (member, predicate) => testNativeCarrier(host, member, predicate));
}

type Predicate = CsharpClosedTypePredicate | { readonly kind: "typeof"; readonly value: string; readonly negated: boolean };

export function selectCsharpNativeFlowTypeMembers(
  host: CsharpTypePolicyHost,
  reference: Node,
  sourceType: Type,
  resolveCarrier: (type: Type) => TargetTypeRef | undefined,
  resolveNominal: (guard: Extract<SourceNativeValueGuard, { readonly kind: "nominal" }>) => TargetTypeRef | undefined,
): readonly Type[] | undefined {
  return selectSourceGuardedTypeMembers(host, reference, sourceType,
    expression => selectNativeGuard(host, expression, resolveNominal),
    (type, predicate) => {
      const carrier = resolveCarrier(type);
      return carrier === undefined ? undefined : testNativeCarrier(host, carrier, predicate);
    });
}

function selectNativeGuard(
  host: CsharpTypePolicyHost,
  expression: Node,
  resolveNominal: (guard: Extract<SourceNativeValueGuard, { readonly kind: "nominal" }>) => TargetTypeRef | undefined,
): SourceNativeGuard<Predicate> | undefined {
  const native = selectSourceNativeValueGuard(host, expression);
  if (native?.kind === "typeof") return { sourceOperand: native.sourceOperand, predicate: native };
  if (native?.kind === "nominal") {
    const targetCarrier = resolveNominal(native);
    if (targetCarrier !== undefined) return { sourceOperand: native.sourceOperand, predicate: { kind: "nominal", targetCarrier } };
  }
  return host.closedTypeGuard(expression);
}

function testNativeCarrier(host: CsharpTypePolicyHost, member: TargetTypeRef, predicate: Predicate): boolean | undefined {
  const category = getCsharpTypeofRuntimeKind(member, host.typeDefinitions);
  if (predicate.kind === "typeof") return category === undefined ? undefined : (category === predicate.value) !== predicate.negated;
  if (predicate.kind === "nominal") {
    if (targetTypeRefEquals(member, predicate.targetCarrier)) return true;
    if (member.kind === "array" || getCsharpJsArrayElementTargetType(member) !== undefined ||
      category !== undefined && category !== "object") return false;
  }
  const test = selectCsharpClosedTypeTestPlan(member, predicate, undefined, host.typeDefinitions);
  return test?.kind === "constant" ? test.value : undefined;
}
