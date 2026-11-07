import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpTargetNamedType } from "../../../target-model/types/factories.js";
import { csharpQualifiedTypeRenderShape } from "../../../target-model/types/render-shapes.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { isCsharpAbsenceTargetType, isCsharpRuntimeUnionTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { resolveCsharpOptionalStorage } from "./optional-storage.js";
import type { SourceClosedSum } from "@tsonic/target-api/source";

export interface CsharpSourceUnionRoleSelection {
  readonly record: SourceClosedSum;
  readonly arms: readonly TargetTypeRef[];
}

interface PhysicalSourceArm {
  readonly index: number;
  readonly type: TargetTypeRef;
  readonly absent: boolean;
}

export function resolveCsharpSourceUnionOperations(
  storage: TargetTypeRef,
  roles: readonly TargetTypeRef[],
  source: CsharpSourceUnionRoleSelection,
  sourceRoles: readonly number[],
): TargetTypeRef | undefined {
  if (roles.length < 2 || roles.length > 8 || sourceRoles.length !== roles.length) return undefined;
  const operations = roles.map((role, index) => resolveCsharpSourceUnionRole(storage, role, source, sourceRoles[index]!, sourceRoles));
  return operations.some(operation => operation === undefined) ? undefined
    : nativeRoleType(`SourceUnionOperations${roles.length}`, [storage, ...roles, ...operations as readonly TargetTypeRef[]]);
}

export function resolveCsharpSourceUnionRole(
  storage: TargetTypeRef,
  role: TargetTypeRef,
  source: CsharpSourceUnionRoleSelection,
  sourceRole: number,
  sourceRoles: readonly number[],
): TargetTypeRef | undefined {
  const relation = source?.record.roles[sourceRole];
  if (relation === undefined || relation.role !== sourceRole || source.arms.length !== source.record.arms.length ||
    !Array.isArray(sourceRoles) || sourceRoles.length === 0 || sourceRoles.length > 8 ||
    new Set(sourceRoles).size !== sourceRoles.length || !sourceRoles.includes(sourceRole) ||
    relation.arms.length === 0 || new Set(relation.arms).size !== relation.arms.length ||
    relation.arms.some(index => !Number.isInteger(index) || index < 0 || index >= source.arms.length)) return undefined;
  const domain = new Set<number>();
  for (const role of sourceRoles) {
    const selected = source.record.roles[role];
    if (!Number.isInteger(role) || selected === undefined || selected.role !== role || selected.arms.length === 0 ||
      new Set(selected.arms).size !== selected.arms.length ||
      selected.arms.some(index => !Number.isInteger(index) || index < 0 || index >= source.arms.length)) return undefined;
    for (const index of selected.arms) domain.add(index);
  }
  const arms: readonly PhysicalSourceArm[] = source.record.arms.map((arm, index) => ({ index,
    type: source.arms[index]!, absent: arm.type.kind === "intrinsic" && arm.type.intrinsic === "absence" }))
    .filter(arm => domain.has(arm.index));
  return sourceStorageMatches(storage, arms) ? projectSourceRole(storage, role, arms, relation.arms) : undefined;
}

function sourceStorageMatches(storage: TargetTypeRef, arms: readonly PhysicalSourceArm[]): boolean {
  if (arms.length === 1) return targetTypeRefEquals(storage, arms[0]!.type);
  const absent = arms.filter(arm => arm.absent);
  if (absent.length !== 0) {
    const present = getCsharpNullableElementTargetType(storage);
    return absent.length === 1 && present !== undefined && sourceStorageMatches(present, arms.filter(arm => !arm.absent));
  }
  return isCsharpRuntimeUnionTargetType(storage) && storage.csharpRuntimeUnionSemantics === "source-sum" &&
    storage.csharpRuntimeUnionArms.length === arms.length &&
    storage.csharpRuntimeUnionArms.every((arm, index) => targetTypeRefEquals(arm, arms[index]!.type));
}

function projectSourceRole(
  storage: TargetTypeRef,
  role: TargetTypeRef,
  arms: readonly PhysicalSourceArm[],
  roleArms: readonly number[],
): TargetTypeRef | undefined {
  if (roleArms.length === arms.length && roleArms.every((index, position) => index === arms[position]!.index) &&
    targetTypeRefEquals(storage, role)) return nativeRoleType("IdentitySourceUnionRole", [role]);
  const storagePresent = getCsharpNullableElementTargetType(storage);
  const rolePresent = getCsharpNullableElementTargetType(role);
  if (storagePresent !== undefined) {
    const absence = arms.filter(arm => arm.absent);
    if (absence.length !== 1) return undefined;
    const presentArms = arms.filter(arm => !arm.absent);
    const presentRoleArms = roleArms.filter(index => index !== absence[0]!.index);
    const storageOptional = optionalOperations(storagePresent);
    if (storageOptional === undefined) return undefined;
    if (roleArms.length === 1 && roleArms[0] === absence[0]!.index) return isCsharpAbsenceTargetType(role)
      ? nativeRoleType("AbsentSourceUnionRole", [storage, storagePresent, storageOptional]) : undefined;
    if (rolePresent !== undefined) {
      if (presentRoleArms.length === roleArms.length) return undefined;
      const roleOptional = optionalOperations(rolePresent);
      const inner = projectSourceRole(storagePresent, rolePresent, presentArms, presentRoleArms);
      return roleOptional === undefined || inner === undefined ? undefined : nativeRoleType("OptionalSourceUnionRole", [
        storage, storagePresent, role, rolePresent, storageOptional, roleOptional, inner,
      ]);
    }
    if (presentRoleArms.length !== roleArms.length) return undefined;
    const inner = projectSourceRole(storagePresent, role, presentArms, presentRoleArms);
    return inner === undefined ? undefined : nativeRoleType("OptionalStorageSourceUnionRole", [
      storage, storagePresent, role, storageOptional, inner,
    ]);
  }
  if (rolePresent !== undefined || arms.some(arm => arm.absent) || !isCsharpRuntimeUnionTargetType(storage) ||
    storage.csharpRuntimeUnionSemantics !== "source-sum") return undefined;
  const nativeArms = storage.csharpRuntimeUnionArms;
  if (nativeArms.length !== arms.length || nativeArms.some((arm, index) => !targetTypeRefEquals(arm, arms[index]!.type))) return undefined;
  if (roleArms.length === 1) {
    const index = arms.findIndex(arm => arm.index === roleArms[0]);
    return index < 0 || !targetTypeRefEquals(nativeArms[index]!, role) ? undefined
      : nativeRoleType(`SourceUnionArm${index + 1}Of${arms.length}`, nativeArms);
  }
  if (!isCsharpRuntimeUnionTargetType(role) || role.csharpRuntimeUnionSemantics !== "source-sum") return undefined;
  const components = role.csharpRuntimeUnionArms;
  if (components.length !== roleArms.length) return undefined;
  const operations = components.map((component, index) => projectSourceRole(storage, component, arms, [roleArms[index]!]));
  return operations.some(operation => operation === undefined) ? undefined
    : nativeRoleType(`CompositeSourceUnionRole${components.length}`, [storage, ...components, ...operations as readonly TargetTypeRef[]]);
}

function nativeRoleType(name: string, arguments_: readonly TargetTypeRef[]): TargetTypeRef {
  return csharpTargetNamedType(`Tsonic.CSharp.Runtime.${name}\`${arguments_.length}`, arguments_,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", name), {
      allowsRefLikeTypeArguments: arguments_.map(() => false), valueType: true,
    });
}

function optionalOperations(present: TargetTypeRef): TargetTypeRef | undefined {
  return resolveCsharpOptionalStorage({ kind: "optional", part: "operations", arguments: [present] }, present);
}
