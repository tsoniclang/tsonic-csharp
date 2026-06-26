import type {
  TargetMember,
} from "@tsonic/tsts";
import {
  nodejsExportDeclarationIdentity,
  nodejsExportMemberDeclarationIdentity,
  nodejsExportMemberSignatureDeclarationIdentity,
  nodejsExportSignatureDeclarationIdentity,
  nodejsProviderDeclarationIdentityKey,
} from "../identity.js";
import {
  nodejsProviderExportSymbolIdentityKey,
  nodejsProviderSymbolIdentityKey,
} from "./provider-identity.js";
import type {
  NodejsClassCallTargetMember,
  NodejsClassPropertyTargetMember,
  NodejsModuleCallTargetMember,
  NodejsModulePropertyTargetMember,
  NodejsUnsupportedTargetIdentity,
} from "./types.js";

export function nodejsCallTargetMemberEntries(
  moduleSpecifier: string,
  exportName: string,
  signatureId: string,
  member: TargetMember,
): readonly (readonly [string, TargetMember])[] {
  return [
    [nodejsProviderDeclarationIdentityKey(nodejsExportSignatureDeclarationIdentity(moduleSpecifier, exportName, signatureId)), member],
  ];
}

export function nodejsCallTargetMemberEntriesForModule(
  moduleSpecifier: string,
  entries: readonly NodejsModuleCallTargetMember[],
): readonly (readonly [string, TargetMember])[] {
  return entries.map((entry) => [
    nodejsProviderDeclarationIdentityKey(nodejsExportSignatureDeclarationIdentity(moduleSpecifier, entry.exportName, entry.signatureId)),
    entry.member,
  ] as const);
}

export function nodejsPropertyTargetMemberEntriesForModule(
  moduleSpecifier: string,
  entries: readonly NodejsModulePropertyTargetMember[],
): readonly (readonly [string, TargetMember])[] {
  return entries.map((entry) => [
    nodejsProviderDeclarationIdentityKey(nodejsExportDeclarationIdentity(moduleSpecifier, entry.exportName)),
    entry.member,
  ] as const);
}

export function nodejsClassCallTargetMemberEntriesForModule(
  moduleSpecifier: string,
  entries: readonly NodejsClassCallTargetMember[],
): readonly (readonly [string, TargetMember])[] {
  return entries.flatMap((entry) => [
    [
      nodejsProviderDeclarationIdentityKey(nodejsExportMemberDeclarationIdentity(moduleSpecifier, entry.exportName, entry.memberName, entry.memberId)),
      entry.member,
    ] as const,
    [
      nodejsProviderDeclarationIdentityKey(nodejsExportMemberSignatureDeclarationIdentity(moduleSpecifier, entry.exportName, entry.memberName, entry.memberId, entry.signatureId)),
      entry.member,
    ] as const,
  ]);
}

export function nodejsClassPropertyTargetMemberEntriesForModule(
  moduleSpecifier: string,
  entries: readonly NodejsClassPropertyTargetMember[],
): readonly (readonly [string, TargetMember])[] {
  return entries.map((entry) => [
    nodejsProviderDeclarationIdentityKey(nodejsExportMemberDeclarationIdentity(moduleSpecifier, entry.exportName, entry.memberName, entry.memberId)),
    entry.member,
  ] as const);
}

export function nodejsProviderMemberSymbolTargetMemberEntries(
  moduleSpecifier: string,
  exportName: string,
  memberName: string,
  signatureId: string,
  member: TargetMember,
): readonly (readonly [string, TargetMember])[] {
  return [
    [nodejsProviderSymbolIdentityKey({ moduleSpecifier, exportName, memberName, signatureId }), member],
  ];
}

export function nodejsProviderSymbolTargetMemberEntriesForModule(
  moduleSpecifier: string,
  entries: readonly NodejsModuleCallTargetMember[],
): readonly (readonly [string, TargetMember])[] {
  return entries.map((entry) => [
    nodejsProviderExportSymbolIdentityKey(moduleSpecifier, entry.exportName, entry.signatureId),
    entry.member,
  ] as const);
}

export function nodejsProviderPropertySymbolTargetMemberEntriesForModule(
  moduleSpecifier: string,
  entries: readonly NodejsModulePropertyTargetMember[],
): readonly (readonly [string, TargetMember])[] {
  return entries.map((entry) => [
    nodejsProviderExportSymbolIdentityKey(moduleSpecifier, entry.exportName, undefined),
    entry.member,
  ] as const);
}

export function nodejsProviderClassCallSymbolTargetMemberEntries(
  moduleSpecifier: string,
  entries: readonly NodejsClassCallTargetMember[],
): readonly (readonly [string, TargetMember])[] {
  return entries.map((entry) => [
    nodejsProviderSymbolIdentityKey({
      moduleSpecifier,
      exportName: entry.exportName,
      memberName: entry.memberName,
      signatureId: entry.signatureId,
    }),
    entry.member,
  ] as const);
}

export function nodejsProviderClassPropertySymbolTargetMemberEntries(
  moduleSpecifier: string,
  entries: readonly NodejsClassPropertyTargetMember[],
): readonly (readonly [string, TargetMember])[] {
  return entries.map((entry) => [
    nodejsProviderSymbolIdentityKey({ moduleSpecifier, exportName: entry.exportName, memberName: entry.memberName }),
    entry.member,
  ] as const);
}

export function nodejsProviderUnsupportedSymbolIdentityEntries(
  moduleSpecifier: string,
  identity: NodejsUnsupportedTargetIdentity,
): readonly (readonly [string, NodejsUnsupportedTargetIdentity])[] {
  return [
    [nodejsProviderSymbolIdentityKey({
      moduleSpecifier,
      exportName: identity.exportName,
      ...(identity.memberName !== undefined ? { memberName: identity.memberName } : {}),
    }), identity],
    ...(identity.signatureId === undefined
      ? []
      : [[nodejsProviderSymbolIdentityKey({
        moduleSpecifier,
        exportName: identity.exportName,
        ...(identity.memberName !== undefined ? { memberName: identity.memberName } : {}),
        signatureId: identity.signatureId,
      }), identity] as const]),
  ];
}
