import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpNullableTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { csharpAbsenceTargetType, isCsharpJsValueTargetType } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { resolveCsharpObjectShapeSelectedMemberTargetType } from "../../../operations/members/object-shape-members.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpDeclaredObjectReceiverMemberSource } from "./declared-receiver-source.js";
import { resolveCsharpStructuralPropertyType } from "./structural-applications.js";
import type { CsharpCurrentNativeNodeInput } from "../../model.js";
import type { CsharpObjectShapeAnalysis } from "../../../../target-model/records/objects/object-shapes.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../../target-model/types/object-shape-members.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import type { CsharpTypePolicyHost } from "./model.js";
import { assertCsharpDeclaredReceiverMemberStorage } from "./declared-receiver-body.js";

export function assertCsharpDeclaredObjectReceiverMemberSource(
  host: Pick<CsharpTypePolicyHost, "declaredObjectReceivers">,
  source: CsharpDeclaredObjectReceiverMemberSource,
): void {
  const { context, declaration, property, queries, state, read } = source;
  assertCsharpDeclaredReceiverMemberStorage(source.storage, declaration, state);
  const memberState = source.storage.state;
  const memberIndex = context.receiver.declaredMembers.indexOf(declaration);
  if (source.kind !== "declared-member" || context !== host.declaredObjectReceivers.get(source.node) ||
    source.access.expression !== source.node || memberIndex < 0 ||
    context.receiver.members[memberIndex] !== declaration.property || declaration.queries !== queries || declaration.method ||
    declaration.getters.length !== 0 || declaration.setters.length !== 0 ||
    property.source.sourceType !== declaration.propertyType || property.source.queries !== queries ||
    property.selected.state.depth !== memberState.depth + 1 ||
    property.selected.state.sourceStorageSubject !== memberState.sourceStorageSubject ||
    property.selected.state.sourceStorageBindings !== memberState.sourceStorageBindings ||
    property.selected.state.sourceBindings !== memberState.sourceBindings ||
    property.selected.state.rejectNativeResolution !== memberState.rejectNativeResolution ||
    read !== undefined && (read.state.depth !== 0 || read.state.sourceStorageSubject !== undefined ||
      read.state.sourceStorageBindings !== undefined || read.state.sourceBindings !== undefined ||
      read.state.rejectNativeResolution !== undefined)) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A declared member requires its exact receiver occurrence, declaration and bound Source children.", source.node);
  }
}

export function resolveFormedCsharpDeclaredObjectReceiverMember(
  scope: CsharpTypeResolutionScope,
  source: CsharpDeclaredObjectReceiverMemberSource,
  mode: "selected" | "storage",
): TargetTypeRef | undefined {
  assertCsharpDeclaredObjectReceiverMemberSource(scope.host, source);
  const { declaration, property, queries, read } = source;
  if (mode === "selected" && read?.absent === true) return csharpAbsenceTargetType();
  const baseType = resolveCsharpStructuralPropertyType(scope, property);
  if (baseType === undefined) return undefined;
  const type = declaration.property.optional ? csharpNullableTargetType(baseType) : baseType;
  const selected = mode === "storage" ? undefined : read;
  const sourceTarget = selected !== undefined && isCsharpJsValueTargetType(type)
    ? scope.resolveTypeWithState(selected.type, queries.sourceFile, selected.state) : undefined;
  const memberType = resolveCsharpObjectShapeSelectedMemberTargetType(
    { type, sourceTypes: [declaration.propertyType] }, selected?.type,
    selected?.declaredTypeIdentical === true, () => selected?.related === true, sourceTarget);
  return scope.optionalAccessTargetType(memberType, source.access.optionalChain);
}

export function requireCsharpDeclaredReceiverMemberCompletion(
  inputs: readonly CsharpCurrentNativeNodeInput[],
  shapes: Pick<CsharpObjectShapeAnalysis, "resolveNode">,
): void {
  for (const input of inputs) {
    const root = input.source.root;
    const source = root.kind === "node" ? root.declaredReceiver?.member : undefined;
    if (source === undefined) continue;
    const shape = shapes.resolveNode(source.context.receiver.self.declaration);
    const selected = shape === undefined ? undefined : resolveCsharpObjectShapeMemberBySelectedSubject(
      shape, source.declaration.subjects);
    if (selected?.kind !== "resolved" || selected.member.memberKind !== "property" ||
      input.readStorageType === undefined || !targetTypeRefEquals(input.readStorageType, selected.member.type)) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "A declared receiver member's body type must equal its final header member type.", source.node);
    }
  }
}
