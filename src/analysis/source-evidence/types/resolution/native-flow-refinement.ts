import type { Node, Type } from "@tsonic/tsts";
import { selectSourceGuardedValueMembers, selectSourceGuardedTypeMembers, selectSourceNativeGuardResult, selectSourceNativeValueGuard, type SourceNativeGuard, type SourceNativeValueGuard, type SourceGuardedValueProof } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpUnionLeaves } from "../../../../target-model/types/union-relations.js";

import type { CsharpTypePolicyHost } from "./model.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { csharpAbsenceTargetType } from "../../../../target-model/types/carriers/runtime-carriers.js";

import { selectCsharpNativeCarrierPredicate, type CsharpNativeFlowPredicate } from "../../../../policy/operations/flow/native-predicates.js";
import { csharpUnionReferenceImplicitlyAccepts } from "../../../../policy/conversions/carriers.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import type { CsharpNativeFlowSelection } from "../../../../policy/model/type-resolution.js";
export function selectCsharpNativeFlowMembers(
  host: CsharpTypePolicyHost,
  reference: Node,
  sourceCarrier: TargetTypeRef,
  resolveNominal: (guard: Extract<SourceNativeValueGuard, { readonly kind: "nominal" }>) => TargetTypeRef | undefined,
): CsharpNativeFlowSelection | undefined {
  const present = getCsharpNullableElementTargetType(sourceCarrier) ?? sourceCarrier;
  const payloads = csharpUnionLeaves(present, host.typeDefinitions)?.map(member => member.carrier) ??
    [present];
  const members = present === sourceCarrier ? payloads
    : [...payloads, csharpAbsenceTargetType()];
  const selected = selectSourceGuardedValueMembers(host, reference, members,
    expression => selectNativeGuard(host, expression, resolveNominal),
    (member, predicate) => selectCsharpNativeCarrierPredicate(host.typeDefinitions, member, predicate));
  if (selected === undefined || selected.kind === "resource-exhausted") return selected;
  type Member = Extract<CsharpNativeFlowSelection, { readonly kind: "resolved" }>["members"][number];
  const distinct = (values: readonly Member[]): readonly Member[] => values.filter((value, index) =>
    values.findIndex(other => targetTypeRefEquals(value.storage, other.storage) && targetTypeRefEquals(value.view, other.view)) === index);
  const refine = (proof: SourceGuardedValueProof<CsharpNativeFlowPredicate>, values: readonly Member[]): readonly Member[] => {
    if (proof.kind !== "guard") return proof.kind === "all" ? refine(proof.right, refine(proof.left, values))
      : distinct([...refine(proof.left, values), ...refine(proof.right, values)]);
    const predicate = proof.guard.predicate;
    return values.flatMap(member => {
      const result = selectCsharpNativeCarrierPredicate(host.typeDefinitions, member.view, predicate);
      if (result !== undefined && result !== proof.assumed) return [];
      if (result === undefined && proof.assumed && predicate.kind === "nominal" &&
        csharpUnionReferenceImplicitlyAccepts({ providers: host.providers, projectTypes: host.projectTypes(),
          typeDefinitions: host.typeDefinitions, objectShapes: host.objectShapes }, predicate.targetCarrier, member.view)) {
        return [Object.freeze({ storage: member.storage, view: predicate.targetCarrier })];
      }
      return [member];
    });
  };
  const refined = refine(selected.proof, members.map(storage => Object.freeze({ storage, view: storage })));
  return Object.freeze({ kind: "resolved", storage: sourceCarrier, members: Object.freeze(distinct(refined)) });
}

export function selectCsharpNativeGuardResult(
  host: CsharpTypePolicyHost,
  expression: Node,
  resolveCarrier: (reference: Node) => TargetTypeRef | undefined,
): boolean | undefined {
  return selectSourceNativeGuardResult(host, expression, reference => {
    const sourceCarrier = resolveCarrier(reference);
    if (sourceCarrier === undefined) return undefined;
    const present = getCsharpNullableElementTargetType(sourceCarrier) ?? sourceCarrier;
    const payloads = csharpUnionLeaves(present, host.typeDefinitions)?.map(member => member.carrier) ?? [present];
    return present === sourceCarrier ? payloads : [...payloads, csharpAbsenceTargetType()];
  }, selected => {
    const guard = selectSourceNativeValueGuard(host, selected);
    return guard?.kind === "typeof" || guard?.kind === "absence"
      ? { sourceOperand: guard.sourceOperand, predicate: guard } : undefined;
  },
    (member, predicate) => selectCsharpNativeCarrierPredicate(host.typeDefinitions, member, predicate));
}

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
      return carrier === undefined ? undefined : selectCsharpNativeCarrierPredicate(host.typeDefinitions, carrier, predicate);
    });
}

function selectNativeGuard(
  host: CsharpTypePolicyHost,
  expression: Node,
  resolveNominal: (guard: Extract<SourceNativeValueGuard, { readonly kind: "nominal" }>) => TargetTypeRef | undefined,
): SourceNativeGuard<CsharpNativeFlowPredicate> | undefined {
  const native = selectSourceNativeValueGuard(host, expression);
  if (native?.kind === "absence") return { sourceOperand: native.sourceOperand, predicate: native };
  if (native?.kind === "typeof") return { sourceOperand: native.sourceOperand, predicate: native };
  if (native?.kind === "literal") return { sourceOperand: native.sourceOperand, predicate: native };
  if (native?.kind === "nominal") {
    const targetCarrier = resolveNominal(native);
    if (targetCarrier !== undefined) return { sourceOperand: native.sourceOperand, predicate: { kind: "nominal", targetCarrier } };
  }
  return host.closedTypeGuard(expression);
}
