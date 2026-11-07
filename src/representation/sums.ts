// Closed Host sums -> CLR carriers (R6, A11, C-2459). Arms stay positional in the Host arm order: no sort, no
// dedupe, no flattening. Absence arms are lifted to Nullable<T> / reference T?. A sum with open arms (free type
// parameters) becomes a SourceUnionStorage projection whose operations are ISourceUnionN over the Host roles.
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { SourceClosedSum, SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../target-model/types/model.js";
import { csharpAbsenceTargetType, csharpSourceSumTargetType, isCsharpAbsenceTargetType, isCsharpRuntimeUnionTargetType } from "../target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../target-model/types/equality.js";
import { csharpFreeTypeParameterIdentities } from "../target-model/types/generic-references.js";
import { csharpProjectedType, type CsharpSourceSumSelection } from "../target-model/types/projections.js";
import { csharpTargetNamedType } from "../target-model/types/factories.js";
import { csharpQualifiedTypeRenderShape } from "../target-model/types/render-shapes.js";
import { resolveCsharpOptionalStorage } from "../policy/types/storage/optional-storage.js";
import { csharpRefusal, isCsharpRefusal, type CsharpRepresentation, type CsharpRepresentationContext } from "./context.js";

export type RepresentDescriptor = (descriptor: SourceTypeDescriptor) => CsharpRepresentation;

const maximumUnionArity = 8;

function isAbsenceArm(type: SourceTypeDescriptor): boolean {
  return type.kind === "intrinsic" && type.intrinsic === "absence";
}

/**
 * OI-LT / E3: a sum record is represented only under the exact program view that published it. The record must be the
 * immutable record this view returns for its own identity; a record from another view (same AST, same-shaped family or
 * forged) is never relabelled as this view's. Identity is the record object, not its family, arms, names or ordinals.
 */
function authenticateSum(sum: SourceClosedSum, context: CsharpRepresentationContext): void {
  let own: SourceClosedSum | undefined;
  try {
    own = context.facts.sums.sum(sum.identity);
  } catch {
    own = undefined;
  }
  if (own !== sum) failTargetAnalysisInvariant("tsonic-csharp",
    "A closed sum record is represented only under the program view that published it (E3, OI-LT).", context.occurrence);
}

function assertSealedSum(sum: SourceClosedSum, site: CsharpRepresentationContext["occurrence"]): void {
  if (sum.arms.length === 0) failTargetAnalysisInvariant("tsonic-csharp", "A Host closed sum must have at least one arm.", site);
  for (const arm of sum.arms) {
    // A11: a void arm is absence and the Host publishes it as absence. Nested sums are flattened by the Host builder.
    if (arm.type.kind === "union" || arm.type.kind === "optional" ||
      arm.type.kind === "intrinsic" && arm.type.intrinsic === "void") failTargetAnalysisInvariant("tsonic-csharp",
      "A Host closed sum arm must be flattened and publish void as absence (A11).", site);
  }
  if (sum.arms.filter(arm => isAbsenceArm(arm.type)).length > 1) failTargetAnalysisInvariant("tsonic-csharp",
    "A Host closed sum has at most one absence arm.", site);
  for (const role of sum.roles) {
    if (sum.roles[role.role] !== role || role.arms.length === 0 ||
      role.arms.some(index => !Number.isInteger(index) || index < 0 || index >= sum.arms.length)) failTargetAnalysisInvariant(
      "tsonic-csharp", "A Host closed sum role must name existing arms by position.", site);
  }
}

/** The sum carrier: positional Union<...> over the present arms, Nullable/`?` when an absence arm exists. */
export function representClosedSum(sum: SourceClosedSum, context: CsharpRepresentationContext,
  represent: RepresentDescriptor): CsharpRepresentation {
  authenticateSum(sum, context);
  assertSealedSum(sum, context.occurrence);
  const absent = sum.arms.some(arm => isAbsenceArm(arm.type));
  const presentArms = sum.arms.filter(arm => !isAbsenceArm(arm.type));
  if (presentArms.length === 0) return csharpAbsenceTargetType();
  const present: TargetTypeRef[] = [];
  for (const arm of presentArms) {
    const selected = represent(arm.type);
    if (isCsharpRefusal(selected)) return selected;
    present.push(selected);
  }
  const value = presentArms.length === 1 ? present[0]! : representPresentArms(sum, presentArms, present, context);
  if (isCsharpRefusal(value)) return value;
  return absent ? csharpNullableTargetType(value) : value;
}

function representPresentArms(
  sum: SourceClosedSum,
  presentArms: SourceClosedSum["arms"],
  present: readonly TargetTypeRef[],
  context: CsharpRepresentationContext,
): CsharpRepresentation {
  if (present.length > maximumUnionArity) return csharpRefusal("CSHARP_UNION_ARITY",
    `The union has ${present.length} non-absent arms; the C# runtime union carries at most ${maximumUnionArity}.`, context.occurrence);
  for (let left = 0; left < present.length; left += 1) {
    for (let right = left + 1; right < present.length; right += 1) {
      if (targetTypeRefEquals(present[left]!, present[right]!)) return csharpRefusal("CSHARP_UNION_ARMS_INDISTINGUISHABLE",
        `Union arms ${left + 1} and ${right + 1} have the same .NET representation, so the runtime union cannot keep them apart.`,
        context.occurrence);
    }
  }
  if (csharpFreeTypeParameterIdentities(present).size === 0) {
    const union = csharpSourceSumTargetType(present);
    if (union === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A 2..8-arm source sum must have a runtime union carrier.", context.occurrence);
    return union;
  }
  // Open arms: the storage is chosen per instantiation; the operations are ISourceUnionN over the Host roles.
  const roles = sum.roles.filter(role => role.arms.some(index => !isAbsenceArm(sum.arms[index]!.type)));
  if (roles.length < 2 || roles.length > maximumUnionArity) return csharpRefusal("CSHARP_UNION_ARITY",
    `An open union needs 2..${maximumUnionArity} generic roles; this one has ${roles.length}.`, context.occurrence);
  const roleArguments: TargetTypeRef[] = [];
  for (const role of roles) {
    const roleArms = role.arms.filter(index => !isAbsenceArm(sum.arms[index]!.type));
    const types = roleArms.map(index => present[presentArms.indexOf(sum.arms[index]!)]!);
    const selected = types.length === 1 ? types[0]! : csharpSourceSumTargetType(types);
    if (selected === undefined) return csharpRefusal("CSHARP_UNION_ARITY",
      `A union role spans ${types.length} arms; the C# runtime union carries 2..${maximumUnionArity}.`, context.occurrence);
    roleArguments.push(role.arms.length === roleArms.length ? selected : csharpNullableTargetType(selected));
  }
  const source = Object.freeze({ kind: "union" as const, types: Object.freeze(presentArms.map(arm => arm.type)) });
  return csharpProjectedType({ kind: "source-union", part: "storage", source, sum: sourceSumSelection(sum, roles, context),
    arguments: present, roleArguments });
}

export function sourceSumSelection(sum: SourceClosedSum, roles: SourceClosedSum["roles"],
  context: CsharpRepresentationContext): CsharpSourceSumSelection {
  authenticateSum(sum, context);
  return Object.freeze({
    owner: context.facts,
    record: sum,
    namingIdentity: context.facts.navigation.identity.identity(sum.identity.family),
    roles: Object.freeze(roles.map(role => Object.freeze({ role: role.role,
      type: role.arms.length === 1 ? sum.arms[role.arms[0]!]!.type
        : Object.freeze({ kind: "union" as const, types: Object.freeze(role.arms.map(index => sum.arms[index]!.type)) }) }))),
  });
}

interface PhysicalSourceArm {
  readonly index: number;
  readonly type: TargetTypeRef;
  readonly absent: boolean;
}

/**
 * The runtime role-operations struct that reads Host role `sourceRole` out of `storage` (SourceUnions/*.cs).
 * `arms` are the represented arms of `sum`, positional; `sourceRoles` are the roles the storage domain covers.
 */
export function representSourceUnionRole(
  storage: TargetTypeRef,
  role: TargetTypeRef,
  sum: SourceClosedSum,
  arms: readonly TargetTypeRef[],
  sourceRole: number,
  sourceRoles: readonly number[],
): TargetTypeRef | undefined {
  const relation = sum.roles[sourceRole];
  if (relation === undefined || relation.role !== sourceRole || arms.length !== sum.arms.length ||
    sourceRoles.length === 0 || sourceRoles.length > maximumUnionArity ||
    new Set(sourceRoles).size !== sourceRoles.length || !sourceRoles.includes(sourceRole)) return undefined;
  const domain = new Set<number>();
  for (const role of sourceRoles) {
    const selected = sum.roles[role];
    if (selected === undefined || selected.role !== role) return undefined;
    for (const index of selected.arms) domain.add(index);
  }
  const physical: readonly PhysicalSourceArm[] = sum.arms.map((arm, index) => ({ index,
    type: arms[index]!, absent: isAbsenceArm(arm.type) })).filter(arm => domain.has(arm.index));
  return sourceStorageMatches(storage, physical) ? projectSourceRole(storage, role, physical, relation.arms) : undefined;
}

/** The ISourceUnionN operations struct over `roles` (2..8) of the storage. */
export function representSourceUnionOperations(
  storage: TargetTypeRef,
  roles: readonly TargetTypeRef[],
  sum: SourceClosedSum,
  arms: readonly TargetTypeRef[],
  sourceRoles: readonly number[],
): TargetTypeRef | undefined {
  if (roles.length < 2 || roles.length > maximumUnionArity || sourceRoles.length !== roles.length) return undefined;
  const operations = roles.map((role, index) => representSourceUnionRole(storage, role, sum, arms, sourceRoles[index]!, sourceRoles));
  return operations.some(operation => operation === undefined) ? undefined
    : runtimeRoleType(`SourceUnionOperations${roles.length}`, [storage, ...roles, ...operations as readonly TargetTypeRef[]]);
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
    targetTypeRefEquals(storage, role)) return runtimeRoleType("IdentitySourceUnionRole", [role]);
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
      ? runtimeRoleType("AbsentSourceUnionRole", [storage, storagePresent, storageOptional]) : undefined;
    if (rolePresent !== undefined) {
      if (presentRoleArms.length === roleArms.length) return undefined;
      const roleOptional = optionalOperations(rolePresent);
      const inner = projectSourceRole(storagePresent, rolePresent, presentArms, presentRoleArms);
      return roleOptional === undefined || inner === undefined ? undefined : runtimeRoleType("OptionalSourceUnionRole", [
        storage, storagePresent, role, rolePresent, storageOptional, roleOptional, inner,
      ]);
    }
    if (presentRoleArms.length !== roleArms.length) return undefined;
    const inner = projectSourceRole(storagePresent, role, presentArms, presentRoleArms);
    return inner === undefined ? undefined : runtimeRoleType("OptionalStorageSourceUnionRole", [
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
      : runtimeRoleType(`SourceUnionArm${index + 1}Of${arms.length}`, nativeArms);
  }
  if (!isCsharpRuntimeUnionTargetType(role) || role.csharpRuntimeUnionSemantics !== "source-sum") return undefined;
  const components = role.csharpRuntimeUnionArms;
  if (components.length !== roleArms.length) return undefined;
  const operations = components.map((component, index) => projectSourceRole(storage, component, arms, [roleArms[index]!]));
  return operations.some(operation => operation === undefined) ? undefined
    : runtimeRoleType(`CompositeSourceUnionRole${components.length}`, [storage, ...components, ...operations as readonly TargetTypeRef[]]);
}

function runtimeRoleType(name: string, arguments_: readonly TargetTypeRef[]): TargetTypeRef {
  return csharpTargetNamedType(`Tsonic.CSharp.Runtime.${name}\`${arguments_.length}`, arguments_,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", name), {
      allowsRefLikeTypeArguments: arguments_.map(() => false), valueType: true,
    });
}

function optionalOperations(present: TargetTypeRef): TargetTypeRef | undefined {
  return resolveCsharpOptionalStorage({ kind: "optional", part: "operations", arguments: [present] }, present);
}
