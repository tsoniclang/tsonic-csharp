import type { AstReader, ExtensionFactSubject, Node, Type } from "@tsonic/tsts";
import { sourceTypeDescriptorStructure, sourceTypeDescriptorsEqual, type SourceDeclarationReference,
  type SourceProgramNavigation, type SourceFileSemantics, type SourceTypeDescriptor } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { substituteCsharpPublishedSourceType } from "./type-bindings.js";
import { resolveCsharpSourceTypeDescriptor } from "./effective-types.js";
import { resolveCsharpPublishedSourceSum } from "./projection-arguments.js";
import { csharpAbsenceTargetType, csharpCarrierAdmitsSourceAbsence, getCsharpRuntimeUnionArms,
} from "../../../../target-model/types/carriers/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { getCsharpGenericOptionalParts } from "../../../../target-model/types/projections.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import type { CsharpPublishedSourceUnionMember } from "../../../../policy/model/type-resolution.js";

export function resolveCsharpPublishedUnionMembers(
  scope: CsharpTypeResolutionScope,
  carrier: TargetTypeRef,
  descriptor: SourceTypeDescriptor,
  occurrence: Node,
  state: CsharpTypeResolutionState,
): readonly CsharpPublishedSourceUnionMember[] | undefined {
  const closed = substituteCsharpPublishedSourceType(scope.host.ast, descriptor, state);
  if (closed === undefined) failTargetAnalysisInvariant("tsonic-csharp",
    "A Source union member lookup requires its identical published binder descriptors.", occurrence);
  const source = sourceTypeDescriptorStructure(closed);
  if (source.kind !== "union" && source.kind !== "optional") return undefined;
  const sum = resolveCsharpPublishedSourceSum(scope, source);
  if (sum === undefined) failTargetAnalysisInvariant("tsonic-csharp",
    "A Source union member lookup requires its identical published family and application.", occurrence);
  const expected = resolveCsharpSourceTypeDescriptor(scope, source, state, occurrence);
  if (expected === undefined) return undefined;
  const payload = getCsharpNullableElementTargetType(carrier) ?? getCsharpGenericOptionalParts(carrier)?.element ?? carrier;
  const expectedPayload = getCsharpNullableElementTargetType(expected) ?? getCsharpGenericOptionalParts(expected)?.element ?? expected;
  const members = getCsharpRuntimeUnionArms(payload, scope.host.typeDefinitions) ?? [payload];
  const expectedMembers = getCsharpRuntimeUnionArms(expectedPayload, scope.host.typeDefinitions) ?? [expectedPayload];
  if (csharpCarrierAdmitsSourceAbsence(carrier) !== csharpCarrierAdmitsSourceAbsence(expected) ||
    members.length !== expectedMembers.length || members.some((member, index) =>
      !targetTypeRefEquals(member, expectedMembers[index]!))) return undefined;
  let payloadIndex = 0;
  const selected: CsharpPublishedSourceUnionMember[] = [];
  for (const [index, arm] of sum.record.arms.entries()) {
    const role = sum.record.roles.find(candidate => candidate.role === arm.role);
    if (role === undefined || !role.arms.includes(index)) failTargetAnalysisInvariant("tsonic-csharp",
      "A published Source union arm must retain its identical original role association.", occurrence);
    const absence = arm.type.kind === "intrinsic" && arm.type.intrinsic === "absence";
    const member = absence ? csharpAbsenceTargetType() : members[payloadIndex++];
    if (member === undefined || absence && !csharpCarrierAdmitsSourceAbsence(carrier)) return undefined;
    selected.push(Object.freeze({ descriptor: arm.type, carrier: member, role: arm.role, arm: index }));
  }
  return payloadIndex !== members.length ? undefined : Object.freeze(selected);
}

export function resolveCsharpUnionMemberCarrier(
  scope: CsharpTypeResolutionScope,
  carrier: TargetTypeRef,
  descriptor: SourceTypeDescriptor,
  selectedDescriptor: SourceTypeDescriptor,
  occurrence: Node,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const members = resolveCsharpPublishedUnionMembers(scope, carrier, descriptor, occurrence, state);
  const closed = substituteCsharpPublishedSourceType(scope.host.ast, selectedDescriptor, state);
  if (members === undefined || closed === undefined) return undefined;
  const exact = members.filter(member => sourceTypeDescriptorsEqual(member.descriptor, closed));
  if (exact.length !== 0) return exact.length === 1 ? exact[0]!.carrier : undefined;
  const selected = sourceTypeDescriptorStructure(closed);
  if (selected.kind !== "union" && selected.kind !== "optional") return undefined;
  const domain = selected.kind === "union" ? selected.types : selected.kind === "optional"
    ? [...(selected.value.kind === "union" ? selected.value.types : [selected.value]),
      { kind: "intrinsic", intrinsic: "absence" } as const] : [selected];
  const selectedMembers = domain.map(type => members.filter(member => sourceTypeDescriptorsEqual(member.descriptor, type)));
  if (selectedMembers.some(matches => matches.length !== 1)) return undefined;
  const first = selectedMembers[0]?.[0];
  if (first === undefined) return undefined;
  return selectedMembers.length === 1 ? first.carrier
    : resolveCsharpSourceTypeDescriptor(scope, selected, state, occurrence);
}

export function sourceFactSubjectsForNode(
  node: Node,
  navigation: SourceProgramNavigation,
  parent?: Node,
): readonly ExtensionFactSubject[] {
  const reference = navigation.sourceReferenceFor(node);
  const subjects: ExtensionFactSubject[] = [];
  if (parent !== undefined) {
    subjects.push(parent);
  }
  subjects.push(node);
  if (reference !== undefined) {
    subjects.push(...sourceDeclarationReferenceFactSubjects(reference));
  }
  return Object.freeze([...new Set(subjects)]);
}

export function sourceDeclarationReferenceFactSubjects(
  reference: SourceDeclarationReference,
): readonly ExtensionFactSubject[] {
  return Object.freeze([
    ...(reference.symbol === undefined ? [] : [reference.symbol]),
    reference.declaration,
  ]);
}

export function resolveTypeParameter(
  type: Type,
  queries: SourceFileSemantics,
  ast: AstReader,
  constraints: import("../../../../target-model/records/types/type-parameter-constraints.js").CsharpTypeParameterEnvironment,
): TargetTypeRef | undefined {
  const symbol = queries.declarations.typeSymbol(type);
  if (symbol === undefined) {
    return undefined;
  }
  for (const declaration of definedValues(
    queries.declarations.symbolDeclarations(symbol),
  )) {
    if (!ast.is.IsTypeParameterDeclaration(declaration)) {
      continue;
    }
    const parameter = csharpSourceTypeParameter(declaration, ast);
    if (parameter !== undefined) return constraints.resolve(parameter, { sourceFile: queries.sourceFile, sourceType: type });
  }
  return undefined;
}

export function definedValues<T>(
  values: readonly (T | undefined)[],
): T[] {
  return values.filter((value): value is T => value !== undefined);
}
