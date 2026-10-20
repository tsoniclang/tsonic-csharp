import type { DotnetInheritedMemberDeclaration, DotnetTypeDeclaration, DotnetTypeRef } from "../types.js";
import { validateDotnetTypeRef } from "./dotnet-types.js";
import { requireNonEmptyString, requireSupportedDiscriminant, requireUnique, supportedPassingModes, type ContractCollector } from "./support.js";

const memberKinds = new Set(["method", "property", "field", "event", "type"]);
const accessibilities = new Set(["public", "protected", "protected-internal"]);
const dispatchKinds = new Set(["method", "get", "set", "add", "remove"]);
const returnPassingModes = new Set(["by-value", "byref-readwrite", "byref-readonly"]);

export function validateDotnetInheritance(
  declaration: DotnetTypeDeclaration,
  path: string,
  collector: ContractCollector,
): void {
  const chainPath = `${path}.inheritance`;
  if (!Array.isArray(declaration.inheritance)) {
    collector.add(chainPath, "Every native declaration requires its exact constructed inheritance chain.");
    return;
  }
  const classCarrier = dotnetTypeDeclarationHasClassCarrier(declaration);
  if (classCarrier && declaration.inheritance.length === 0 ||
    !classCarrier && declaration.inheritance.length !== 0) {
    collector.add(chainPath, "Only a physical native class carries a nonempty class chain through System.Object.");
  }
  const identities = new Set<string>();
  for (const [index, entry] of declaration.inheritance.entries()) {
    const entryPath = `${chainPath}[${index}]`;
    if (entry === null || typeof entry !== "object") {
      collector.add(entryPath, "A native inheritance entry requires its exact identity and physical type.");
      continue;
    }
    requireNonEmptyString(entry.targetId, `${entryPath}.targetId`, collector);
    requireUnique(identities, entry.targetId, `${entryPath}.targetId`, collector);
    validatePhysicalType(entry.type, `${entryPath}.type`, collector);
    if (entry.type?.kind === "named" && entry.type.targetId !== entry.targetId) {
      collector.add(entryPath, "A native class-chain identity must match its instantiated named type.");
    }
  }
  if (classCarrier && declaration.inheritance[0]?.targetId !== declaration.targetId) {
    collector.add(chainPath, "A native class chain begins with the declaration's own physical identity.");
  }
  if (classCarrier && declaration.inheritance[declaration.inheritance.length - 1]?.type?.kind !== "object") {
    collector.add(chainPath, "A native class chain must end in the actual native System.Object root.");
  }
  if (declaration.inheritableMembers === undefined) return;
  const membersPath = `${path}.inheritableMembers`;
  if (!Array.isArray(declaration.inheritableMembers)) {
    collector.add(membersPath, "A complete native class requires its own declared inheritable-member array.");
    return;
  }
  if (!classCarrier && declaration.inheritableMembers.length !== 0) {
    collector.add(membersPath, "A nonclass physical representation has no declared class members to inherit.");
  }
  const signatures = new Set<string>();
  for (const [index, member] of declaration.inheritableMembers.entries()) {
    const memberPath = `${membersPath}[${index}]`;
    if (member === null || typeof member !== "object") {
      collector.add(memberPath, "An inheritable member requires exact native metadata.");
      continue;
    }
    requireNonEmptyString(member.targetName, `${memberPath}.targetName`, collector);
    requireSupportedDiscriminant(member.kind, `${memberPath}.kind`, collector, "Native inheritable member kind", memberKinds);
    requireSupportedDiscriminant(member.accessibility, `${memberPath}.accessibility`, collector, "Native derived-assembly accessibility", accessibilities);
    if (typeof member.static !== "boolean") {
      collector.add(`${memberPath}.static`, "An inheritable member requires its exact native staticness.");
    }
    if (!Number.isInteger(member.genericArity) || member.genericArity < 0 ||
      !Array.isArray(member.genericParameterIds) ||
      member.genericParameterIds.length !== member.genericArity) {
      collector.add(`${memberPath}.genericParameterIds`, "Ordered native generic identities must match the member's exact arity.");
    } else {
      const parameters = new Set<string>();
      for (const [position, identity] of member.genericParameterIds.entries()) {
        requireNonEmptyString(identity, `${memberPath}.genericParameterIds[${position}]`, collector);
        requireUnique(parameters, identity, `${memberPath}.genericParameterIds[${position}]`, collector);
      }
    }
    if (!Array.isArray(member.parameters)) {
      collector.add(`${memberPath}.parameters`, "Every inheritable member requires its exact physical parameter list.");
      continue;
    }
    for (const [position, parameter] of member.parameters.entries()) {
      const parameterPath = `${memberPath}.parameters[${position}]`;
      if (parameter === null || typeof parameter !== "object") {
        collector.add(parameterPath, "A native parameter requires its physical type and passing mode.");
        continue;
      }
      validatePhysicalType(parameter.type, `${parameterPath}.type`, collector);
      requireSupportedDiscriminant(parameter.passingMode, `${parameterPath}.passingMode`, collector, "Native parameter passing mode", supportedPassingModes);
    }
    requireUnique(signatures, JSON.stringify([
      member.targetName, member.kind, member.static, member.genericArity,
      member.parameters,
    ]), memberPath, collector);
    validateDispatchSlots(member, memberPath, collector);
  }
}

function validateDispatchSlots(member: DotnetInheritedMemberDeclaration, path: string, collector: ContractCollector): void {
  const slotsPath = `${path}.dispatchSlots`;
  if (!Array.isArray(member.dispatchSlots)) {
    collector.add(slotsPath, "Every native inheritable member requires its exact dispatch-slot array.");
    return;
  }
  const allowedKinds = member.kind === "method" ? new Set(["method"]) :
    member.kind === "property" ? new Set(["get", "set"]) :
    member.kind === "event" ? new Set(["add", "remove"]) : new Set<string>();
  if (member.kind === "method" && member.dispatchSlots.length !== 1 ||
    (member.kind === "property" || member.kind === "event") && member.dispatchSlots.length === 0 ||
    (member.kind === "field" || member.kind === "type") && member.dispatchSlots.length !== 0) {
    collector.add(slotsPath, "A native callable member requires its actual method or accessible accessor slots; fields and nested types have none.");
  }
  const kinds = new Set<string>();
  const identities = new Set<string>();
  for (const [index, slot] of member.dispatchSlots.entries()) {
    const slotPath = `${slotsPath}[${index}]`;
    if (slot === null || typeof slot !== "object") {
      collector.add(slotPath, "A native dispatch slot requires exact physical method evidence.");
      continue;
    }
    requireSupportedDiscriminant(slot.kind, `${slotPath}.kind`, collector, "Native dispatch slot kind", dispatchKinds);
    if (!allowedKinds.has(slot.kind)) collector.add(`${slotPath}.kind`, "The dispatch slot must belong to its native member kind.");
    requireUnique(kinds, slot.kind, `${slotPath}.kind`, collector);
    requireNonEmptyString(slot.id, `${slotPath}.id`, collector);
    requireUnique(identities, slot.id, `${slotPath}.id`, collector);
    requireNonEmptyString(slot.baseDefinitionId, `${slotPath}.baseDefinitionId`, collector);
    for (const flag of ["virtual", "abstract", "final"] as const) {
      if (typeof slot[flag] !== "boolean") collector.add(`${slotPath}.${flag}`, "A native dispatch slot requires its exact method flags.");
    }
    requireSupportedDiscriminant(slot.accessibility, `${slotPath}.accessibility`, collector, "Native dispatch accessibility", accessibilities);
    if (!Array.isArray(slot.genericParameterIds)) {
      collector.add(`${slotPath}.genericParameterIds`, "A native dispatch slot requires ordered generic parameter identities.");
    } else {
      const genericIdentities = new Set<string>();
      for (const [position, identity] of slot.genericParameterIds.entries()) {
        requireNonEmptyString(identity, `${slotPath}.genericParameterIds[${position}]`, collector);
        requireUnique(genericIdentities, identity, `${slotPath}.genericParameterIds[${position}]`, collector);
      }
    }
    if (!Array.isArray(slot.parameters)) {
      collector.add(`${slotPath}.parameters`, "A native dispatch slot requires its exact physical parameter list.");
    } else {
      for (const [position, parameter] of slot.parameters.entries()) {
        const parameterPath = `${slotPath}.parameters[${position}]`;
        if (parameter === null || typeof parameter !== "object") {
          collector.add(parameterPath, "A native dispatch parameter requires its physical type and passing mode.");
          continue;
        }
        validatePhysicalType(parameter.type, `${parameterPath}.type`, collector);
        requireSupportedDiscriminant(parameter.passingMode, `${parameterPath}.passingMode`, collector, "Native dispatch parameter passing", supportedPassingModes);
      }
    }
    validatePhysicalType(slot.returnType, `${slotPath}.returnType`, collector);
    requireSupportedDiscriminant(slot.returnPassing, `${slotPath}.returnPassing`, collector, "Native dispatch return passing", returnPassingModes);
  }
}

export function dotnetTypeDeclarationHasClassCarrier(declaration: DotnetTypeDeclaration): boolean {
  return declaration.typeKind === "class" &&
    (declaration.targetType === undefined || declaration.targetType.kind === "named");
}

function validatePhysicalType(type: DotnetTypeRef, path: string, collector: ContractCollector): void {
  if (type === null || typeof type !== "object") {
    collector.add(path, "Native inheritance requires an exact physical type.");
    return;
  }
  validateDotnetTypeRef(type, path, collector, {
    allowLiteral: false,
    allowProviderRef: false,
    targetPosition: true,
  });
}
