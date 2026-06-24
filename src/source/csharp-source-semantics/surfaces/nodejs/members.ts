import type {
  ProviderSymbolIdentity,
  TargetIdentity,
  TargetMember,
  TargetOperationFact,
} from "@tsonic/tsts";
import type {
  CsharpTargetOperationFact,
} from "../../../csharp-facts.js";
import {
  csharpTargetOperationFromMember,
  targetOperationFromMember,
} from "../../operations.js";
import {
  csharpTargetId,
} from "../../identity.js";
import {
  getNodeBufferLengthTargetMember,
  getNodeBufferTargetMember,
  nodeBufferAllocExportName,
  nodeBufferAllocMemberId,
  nodeBufferAllocSignatureId,
  nodeBufferAllocUnsafeExportName,
  nodeBufferAllocUnsafeMemberId,
  nodeBufferAllocUnsafeSignatureId,
  nodeBufferAllocUnsafeSlowExportName,
  nodeBufferAllocUnsafeSlowMemberId,
  nodeBufferAllocUnsafeSlowSignatureId,
  nodeBufferByteLengthExportName,
  nodeBufferByteLengthMemberId,
  nodeBufferByteLengthSignatureId,
  nodeBufferCompareExportName,
  nodeBufferCompareMemberId,
  nodeBufferCompareSignatureId,
  nodeBufferConcatExportName,
  nodeBufferConcatMemberId,
  nodeBufferConcatSignatureId,
  nodeBufferEqualsExportName,
  nodeBufferEqualsMemberId,
  nodeBufferEqualsSignatureId,
  nodeBufferExportName,
  nodeBufferFromExportName,
  nodeBufferFromStringMemberId,
  nodeBufferFromStringSignatureId,
  nodeBufferIsEncodingExportName,
  nodeBufferIsEncodingMemberId,
  nodeBufferIsEncodingSignatureId,
  nodeBufferLengthMemberId,
  nodeBufferModuleSpecifier,
  nodeBufferOfExportName,
  nodeBufferOfMemberId,
  nodeBufferOfSignatureId,
  nodeBufferSliceExportName,
  nodeBufferSliceMemberId,
  nodeBufferSliceSignatureId,
  nodeBufferSubarrayExportName,
  nodeBufferSubarrayMemberId,
  nodeBufferSubarraySignatureId,
  nodeBufferToStringExportName,
  nodeBufferToStringMemberId,
  nodeBufferToStringSignatureId,
} from "./buffer.js";
import {
  nodeCryptoCallTargetMembers,
  nodeCryptoModuleSpecifier,
} from "./crypto.js";
import {
  getNodeFsTargetMember,
  nodeFsCallTargetMembers,
  nodeFsModuleSpecifier,
} from "./filesystem.js";
import {
  nodeOsCallTargetMembers,
  nodeOsModuleSpecifier,
  nodeOsPropertyTargetMembers,
} from "./os.js";
import {
  getNodePathTargetMember,
  nodePathModuleSpecifier,
  nodePathCallTargetMembers,
  nodePathPropertyTargetMembers,
} from "./path.js";
import {
  nodeProcessModuleSpecifier,
  nodeProcessCallTargetMembers,
  nodeProcessPropertyTargetMembers,
  nodeProcessUnsupportedTargetIdentities,
} from "./process.js";
import {
  nodeUtilCallTargetMembers,
  nodeUtilModuleSpecifier,
  nodeUtilUnsupportedTargetIdentities,
} from "./util.js";
import {
  getNodeUrlTargetMember,
  nodeUrlCallTargetMembers,
  nodeUrlClassCallTargetMembers,
  nodeUrlClassPropertyTargetMembers,
  nodeUrlModuleSpecifier,
  nodeUrlUnsupportedTargetIdentities,
} from "./url.js";
import {
  csharpNodejsVirtualDeclarationFileName,
  nodejsExportDeclarationIdentity,
  nodejsExportMemberDeclarationIdentity,
  nodejsExportSignatureDeclarationIdentity,
  nodejsProviderDeclarationIdentityKey,
} from "./identity.js";
import type {
  NodejsProviderDeclarationIdentity,
} from "./identity.js";
import {
  canonicalNodejsModuleSpecifier,
  isSupportedNodejsModuleSpecifier,
} from "./module-specifiers.js";

interface NodejsModuleCallTargetMember {
  readonly exportName: string;
  readonly signatureId: string;
  readonly member: TargetMember;
}

interface NodejsModulePropertyTargetMember {
  readonly exportName: string;
  readonly member: TargetMember;
}

export function isNodejsProviderModule(moduleSpecifier: string | undefined): boolean {
  return isSupportedNodejsModuleSpecifier(moduleSpecifier);
}

export function getNodejsCallTargetMember(declaration: NodejsProviderDeclarationIdentity): TargetMember | undefined {
  const canonicalDeclaration = canonicalNodejsDeclarationIdentity(declaration);
  const bufferMember = canonicalDeclaration.moduleSpecifier === nodeBufferModuleSpecifier
    ? getNodeBufferTargetMember(canonicalDeclaration.memberId, canonicalDeclaration.signatureId)
    : undefined;
  if (bufferMember !== undefined) {
    return bufferMember;
  }
  const fsMember = canonicalDeclaration.moduleSpecifier === nodeFsModuleSpecifier
    ? getNodeFsTargetMember(canonicalDeclaration.memberId, canonicalDeclaration.signatureId)
    : undefined;
  if (fsMember !== undefined) {
    return fsMember;
  }
  const urlMember = canonicalDeclaration.moduleSpecifier === nodeUrlModuleSpecifier
    ? getNodeUrlTargetMember(canonicalDeclaration.memberId, canonicalDeclaration.signatureId)
    : undefined;
  if (urlMember !== undefined) {
    return urlMember;
  }
  return nodejsCallTargetMembersByDeclarationIdentity.get(nodejsProviderDeclarationIdentityKey(canonicalDeclaration));
}

export function getCsharpNodejsPropertyOperation(
  declaration: NodejsProviderDeclarationIdentity,
): { readonly operation: TargetOperationFact; readonly csharpOperation: CsharpTargetOperationFact } | undefined {
  const canonicalDeclaration = canonicalNodejsDeclarationIdentity(declaration);
  const pathMember = canonicalDeclaration.moduleSpecifier === nodePathModuleSpecifier
    ? getNodePathTargetMember(canonicalDeclaration.memberId)
    : undefined;
  const fsMember = canonicalDeclaration.moduleSpecifier === nodeFsModuleSpecifier
    ? getNodeFsTargetMember(canonicalDeclaration.memberId, canonicalDeclaration.signatureId)
    : undefined;
  const urlMember = canonicalDeclaration.moduleSpecifier === nodeUrlModuleSpecifier
    ? getNodeUrlTargetMember(canonicalDeclaration.memberId, canonicalDeclaration.signatureId)
    : undefined;
  const member = pathMember
    ?? fsMember
    ?? urlMember
    ?? nodejsPropertyTargetMembersByDeclarationIdentity.get(nodejsProviderDeclarationIdentityKey(canonicalDeclaration));
  return member === undefined
    ? undefined
    : {
        operation: targetOperationFromMember(member),
        csharpOperation: csharpTargetOperationFromMember(member),
      };
}

export function getNodejsTargetIdentity(symbol: ProviderSymbolIdentity): TargetIdentity | undefined {
  const canonicalSpecifier = canonicalNodejsModuleSpecifier(symbol.moduleSpecifier);
  const member = canonicalSpecifier === undefined
    ? undefined
    : nodejsTargetMembersByProviderSymbolIdentity.get(nodejsProviderSymbolIdentityKey({
        ...symbol,
        moduleSpecifier: canonicalSpecifier,
      }));
  if (member !== undefined) {
    return {
      target: csharpTargetId,
      id: member.id,
      displayName: member.targetName,
    };
  }
  const unsupported = canonicalSpecifier === undefined
    ? undefined
    : nodejsUnsupportedTargetIdentitiesByProviderSymbol.get(nodejsProviderSymbolIdentityKey({
        ...symbol,
        moduleSpecifier: canonicalSpecifier,
      }));
  return unsupported === undefined
    ? undefined
    : {
        target: csharpTargetId,
        id: unsupported.targetIdentityId,
        displayName: unsupported.displayName,
      };
}

function canonicalNodejsDeclarationIdentity(declaration: NodejsProviderDeclarationIdentity): NodejsProviderDeclarationIdentity {
  const canonicalSpecifier = canonicalNodejsModuleSpecifier(declaration.moduleSpecifier);
  return canonicalSpecifier === undefined
    ? declaration
    : {
        ...declaration,
        providerModuleId: canonicalSpecifier,
        moduleSpecifier: canonicalSpecifier,
        virtualFileName: csharpNodejsVirtualDeclarationFileName(canonicalSpecifier),
      };
}

const nodejsCallTargetMembersByDeclarationIdentity = new Map<string, TargetMember>([
  ...nodejsCallTargetMemberEntries(nodeBufferModuleSpecifier, "atob", "node:buffer.atob(System.String)", requiredNodeBufferTargetMember(undefined, "node:buffer.atob(System.String)")),
  ...nodejsCallTargetMemberEntries(nodeBufferModuleSpecifier, "btoa", "node:buffer.btoa(System.String)", requiredNodeBufferTargetMember(undefined, "node:buffer.btoa(System.String)")),
  ...nodejsCallTargetMemberEntries(nodeBufferModuleSpecifier, "isAscii", "node:buffer.isAscii(Tsonic.CSharp.Node.Buffer)", requiredNodeBufferTargetMember(undefined, "node:buffer.isAscii(Tsonic.CSharp.Node.Buffer)")),
  ...nodejsCallTargetMemberEntries(nodeBufferModuleSpecifier, "isUtf8", "node:buffer.isUtf8(Tsonic.CSharp.Node.Buffer)", requiredNodeBufferTargetMember(undefined, "node:buffer.isUtf8(Tsonic.CSharp.Node.Buffer)")),
  ...nodejsCallTargetMemberEntriesForModule(nodePathModuleSpecifier, nodePathCallTargetMembers()),
  ...nodejsCallTargetMemberEntriesForModule(nodeFsModuleSpecifier, nodeFsCallTargetMembers()),
  ...nodejsCallTargetMemberEntriesForModule(nodeCryptoModuleSpecifier, nodeCryptoCallTargetMembers()),
  ...nodejsCallTargetMemberEntriesForModule(nodeOsModuleSpecifier, nodeOsCallTargetMembers()),
  ...nodejsCallTargetMemberEntriesForModule(nodeProcessModuleSpecifier, nodeProcessCallTargetMembers()),
  ...nodejsCallTargetMemberEntriesForModule(nodeUtilModuleSpecifier, nodeUtilCallTargetMembers()),
  ...nodejsCallTargetMemberEntriesForModule(nodeUrlModuleSpecifier, nodeUrlCallTargetMembers()),
]);

const nodejsPropertyTargetMembersByDeclarationIdentity = new Map<string, TargetMember>([
  [nodejsProviderDeclarationIdentityKey(nodejsExportMemberDeclarationIdentity(nodeBufferModuleSpecifier, nodeBufferExportName, "length", nodeBufferLengthMemberId)), getNodeBufferLengthTargetMember()],
  ...nodejsPropertyTargetMemberEntriesForModule(nodePathModuleSpecifier, nodePathPropertyTargetMembers()),
  ...nodejsPropertyTargetMemberEntriesForModule(nodeOsModuleSpecifier, nodeOsPropertyTargetMembers()),
  ...nodejsPropertyTargetMemberEntriesForModule(nodeProcessModuleSpecifier, nodeProcessPropertyTargetMembers()),
]);

const nodejsTargetMembersByProviderSymbolIdentity = new Map<string, TargetMember>([
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferFromExportName, nodeBufferFromStringSignatureId, requiredNodeBufferTargetMember(nodeBufferFromStringMemberId, nodeBufferFromStringSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferAllocExportName, nodeBufferAllocSignatureId, requiredNodeBufferTargetMember(nodeBufferAllocMemberId, nodeBufferAllocSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferAllocUnsafeExportName, nodeBufferAllocUnsafeSignatureId, requiredNodeBufferTargetMember(nodeBufferAllocUnsafeMemberId, nodeBufferAllocUnsafeSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferAllocUnsafeSlowExportName, nodeBufferAllocUnsafeSlowSignatureId, requiredNodeBufferTargetMember(nodeBufferAllocUnsafeSlowMemberId, nodeBufferAllocUnsafeSlowSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferByteLengthExportName, nodeBufferByteLengthSignatureId, requiredNodeBufferTargetMember(nodeBufferByteLengthMemberId, nodeBufferByteLengthSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferCompareExportName, nodeBufferCompareSignatureId, requiredNodeBufferTargetMember(nodeBufferCompareMemberId, nodeBufferCompareSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferConcatExportName, nodeBufferConcatSignatureId, requiredNodeBufferTargetMember(nodeBufferConcatMemberId, nodeBufferConcatSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferEqualsExportName, nodeBufferEqualsSignatureId, requiredNodeBufferTargetMember(nodeBufferEqualsMemberId, nodeBufferEqualsSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferIsEncodingExportName, nodeBufferIsEncodingSignatureId, requiredNodeBufferTargetMember(nodeBufferIsEncodingMemberId, nodeBufferIsEncodingSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferOfExportName, nodeBufferOfSignatureId, requiredNodeBufferTargetMember(nodeBufferOfMemberId, nodeBufferOfSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferSliceExportName, nodeBufferSliceSignatureId, requiredNodeBufferTargetMember(nodeBufferSliceMemberId, nodeBufferSliceSignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferSubarrayExportName, nodeBufferSubarraySignatureId, requiredNodeBufferTargetMember(nodeBufferSubarrayMemberId, nodeBufferSubarraySignatureId)),
  ...nodejsProviderMemberSymbolTargetMemberEntries(nodeBufferModuleSpecifier, nodeBufferExportName, nodeBufferToStringExportName, nodeBufferToStringSignatureId, requiredNodeBufferTargetMember(nodeBufferToStringMemberId, nodeBufferToStringSignatureId)),
  [nodejsProviderSymbolIdentityKey({ moduleSpecifier: nodeBufferModuleSpecifier, exportName: nodeBufferExportName, memberName: "length" }), getNodeBufferLengthTargetMember()],
  ...nodejsProviderSymbolTargetMemberEntriesForModule(nodePathModuleSpecifier, nodePathCallTargetMembers()),
  ...nodejsProviderPropertySymbolTargetMemberEntriesForModule(nodePathModuleSpecifier, nodePathPropertyTargetMembers()),
  ...nodejsProviderSymbolTargetMemberEntriesForModule(nodeFsModuleSpecifier, nodeFsCallTargetMembers()),
  ...nodejsProviderSymbolTargetMemberEntriesForModule(nodeCryptoModuleSpecifier, nodeCryptoCallTargetMembers()),
  ...nodejsProviderSymbolTargetMemberEntriesForModule(nodeOsModuleSpecifier, nodeOsCallTargetMembers()),
  ...nodejsProviderPropertySymbolTargetMemberEntriesForModule(nodeOsModuleSpecifier, nodeOsPropertyTargetMembers()),
  ...nodejsProviderSymbolTargetMemberEntriesForModule(nodeProcessModuleSpecifier, nodeProcessCallTargetMembers()),
  ...nodejsProviderPropertySymbolTargetMemberEntriesForModule(nodeProcessModuleSpecifier, nodeProcessPropertyTargetMembers()),
  ...nodejsProviderSymbolTargetMemberEntriesForModule(nodeUtilModuleSpecifier, nodeUtilCallTargetMembers()),
  ...nodejsProviderSymbolTargetMemberEntriesForModule(nodeUrlModuleSpecifier, nodeUrlCallTargetMembers()),
  ...nodejsProviderClassCallSymbolTargetMemberEntries(nodeUrlModuleSpecifier, nodeUrlClassCallTargetMembers()),
  ...nodejsProviderClassPropertySymbolTargetMemberEntries(nodeUrlModuleSpecifier, nodeUrlClassPropertyTargetMembers()),
]);

const nodejsUnsupportedTargetIdentitiesByProviderSymbol = new Map(
  [
    ...nodeUtilUnsupportedTargetIdentities().flatMap((identity) => [
      [nodejsProviderExportSymbolIdentityKey(nodeUtilModuleSpecifier, identity.exportName, undefined), identity] as const,
      [nodejsProviderExportSymbolIdentityKey(nodeUtilModuleSpecifier, identity.exportName, identity.signatureId), identity] as const,
    ]),
    ...nodeProcessUnsupportedTargetIdentities().map((identity) => [
      nodejsProviderExportSymbolIdentityKey(nodeProcessModuleSpecifier, identity.exportName, undefined),
      identity,
    ] as const),
    ...nodeUrlUnsupportedTargetIdentities().flatMap((identity) =>
      nodejsProviderUnsupportedSymbolIdentityEntries(nodeUrlModuleSpecifier, identity)
    ),
  ],
);

function nodejsCallTargetMemberEntries(
  moduleSpecifier: string,
  exportName: string,
  signatureId: string,
  member: TargetMember,
): readonly (readonly [string, TargetMember])[] {
  return [
    [nodejsProviderDeclarationIdentityKey(nodejsExportDeclarationIdentity(moduleSpecifier, exportName)), member],
    [nodejsProviderDeclarationIdentityKey(nodejsExportSignatureDeclarationIdentity(moduleSpecifier, exportName, signatureId)), member],
  ];
}

function nodejsCallTargetMemberEntriesForModule(
  moduleSpecifier: string,
  entries: readonly NodejsModuleCallTargetMember[],
): readonly (readonly [string, TargetMember])[] {
  const exportCounts = nodejsModuleCallExportCounts(entries);
  return entries.flatMap((entry) => [
    ...(exportCounts.get(entry.exportName) === 1
      ? [[nodejsProviderDeclarationIdentityKey(nodejsExportDeclarationIdentity(moduleSpecifier, entry.exportName)), entry.member] as const]
      : []),
    [nodejsProviderDeclarationIdentityKey(nodejsExportSignatureDeclarationIdentity(moduleSpecifier, entry.exportName, entry.signatureId)), entry.member] as const,
  ]);
}

function nodejsPropertyTargetMemberEntriesForModule(
  moduleSpecifier: string,
  entries: readonly NodejsModulePropertyTargetMember[],
): readonly (readonly [string, TargetMember])[] {
  return entries.map((entry) => [
    nodejsProviderDeclarationIdentityKey(nodejsExportDeclarationIdentity(moduleSpecifier, entry.exportName)),
    entry.member,
  ] as const);
}

function nodejsProviderMemberSymbolTargetMemberEntries(
  moduleSpecifier: string,
  exportName: string,
  memberName: string,
  signatureId: string,
  member: TargetMember,
): readonly (readonly [string, TargetMember])[] {
  return [
    [nodejsProviderSymbolIdentityKey({ moduleSpecifier, exportName, memberName }), member],
    [nodejsProviderSymbolIdentityKey({ moduleSpecifier, exportName, memberName, signatureId }), member],
  ];
}

function nodejsProviderSymbolTargetMemberEntriesForModule(
  moduleSpecifier: string,
  entries: readonly NodejsModuleCallTargetMember[],
): readonly (readonly [string, TargetMember])[] {
  const exportCounts = nodejsModuleCallExportCounts(entries);
  return entries.flatMap((entry) => [
    ...(exportCounts.get(entry.exportName) === 1
      ? [[nodejsProviderExportSymbolIdentityKey(moduleSpecifier, entry.exportName, undefined), entry.member] as const]
      : []),
    [nodejsProviderExportSymbolIdentityKey(moduleSpecifier, entry.exportName, entry.signatureId), entry.member] as const,
  ]);
}

function nodejsProviderPropertySymbolTargetMemberEntriesForModule(
  moduleSpecifier: string,
  entries: readonly NodejsModulePropertyTargetMember[],
): readonly (readonly [string, TargetMember])[] {
  return entries.map((entry) => [
    nodejsProviderExportSymbolIdentityKey(moduleSpecifier, entry.exportName, undefined),
    entry.member,
  ] as const);
}

function nodejsProviderClassCallSymbolTargetMemberEntries(
  moduleSpecifier: string,
  entries: readonly {
    readonly exportName: string;
    readonly memberName: string;
    readonly signatureId: string;
    readonly member: TargetMember;
  }[],
): readonly (readonly [string, TargetMember])[] {
  return entries.flatMap((entry) => [
    [nodejsProviderSymbolIdentityKey({ moduleSpecifier, exportName: entry.exportName, memberName: entry.memberName }), entry.member] as const,
    [nodejsProviderSymbolIdentityKey({ moduleSpecifier, exportName: entry.exportName, memberName: entry.memberName, signatureId: entry.signatureId }), entry.member] as const,
  ]);
}

function nodejsProviderClassPropertySymbolTargetMemberEntries(
  moduleSpecifier: string,
  entries: readonly {
    readonly exportName: string;
    readonly memberName: string;
    readonly member: TargetMember;
  }[],
): readonly (readonly [string, TargetMember])[] {
  return entries.map((entry) => [
    nodejsProviderSymbolIdentityKey({ moduleSpecifier, exportName: entry.exportName, memberName: entry.memberName }),
    entry.member,
  ] as const);
}

function nodejsProviderUnsupportedSymbolIdentityEntries(
  moduleSpecifier: string,
  identity: {
    readonly exportName: string;
    readonly memberName?: string;
    readonly signatureId?: string;
    readonly targetIdentityId: string;
    readonly displayName: string;
  },
): readonly (readonly [string, { readonly targetIdentityId: string; readonly displayName: string }])[] {
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

function nodejsModuleCallExportCounts(entries: readonly NodejsModuleCallTargetMember[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.exportName, (counts.get(entry.exportName) ?? 0) + 1);
  }
  return counts;
}

function requiredNodeBufferTargetMember(
  memberId: string | undefined,
  signatureId: string | undefined,
): TargetMember {
  const member = getNodeBufferTargetMember(memberId, signatureId);
  if (member === undefined) {
    throw new Error(`Missing C# NodeJS Buffer target member '${signatureId ?? memberId ?? ""}'.`);
  }
  return member;
}

function nodejsProviderSymbolIdentityKey(
  symbol: ProviderSymbolIdentity,
): string {
  return [
    symbol.moduleSpecifier,
    symbol.exportName ?? "",
    symbol.memberName ?? "",
    symbol.signatureId ?? "",
  ].join("\u0000");
}

function nodejsProviderExportSymbolIdentityKey(
  moduleSpecifier: string,
  exportName: string,
  signatureId: string | undefined,
): string {
  return nodejsProviderSymbolIdentityKey({
    moduleSpecifier,
    exportName,
    ...(signatureId !== undefined ? { signatureId } : {}),
  });
}
