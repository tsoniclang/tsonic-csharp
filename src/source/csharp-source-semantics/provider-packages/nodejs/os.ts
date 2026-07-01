import type {
  ProviderExportDeclaration,
  ProviderParameterDeclaration,
  ProviderTypeExpression,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
} from "../../surfaces/js/source-library.js";
import {
  getNodejsProviderExportDeclarationTargetMember,
  getNodejsProviderExportSignatureDeclarationTargetMember,
  nodejsProviderExportDeclarationTargetMemberIndex,
  nodejsProviderExportSignatureDeclarationTargetMemberIndex,
} from "./metadata-indexes.js";
import {
  nodejsModuleCallTargetMetadata,
  nodejsModulePropertyTargetMetadata,
} from "./members/target-member-metadata.js";
import {
  nodejsDefaultModuleObjectExports,
} from "./module-defaults.js";
import type {
  NodejsUnsupportedTargetIdentity,
} from "./members/types.js";
import type {
  NodejsModuleCallTargetMetadata,
  NodejsModuleCallTargetMetadataRow,
  NodejsModulePropertyTargetMetadata,
  NodejsModulePropertyTargetMetadataRow,
} from "./members/target-member-metadata.js";

const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const numberProviderType = { kind: "number" } satisfies ProviderTypeExpression;
const voidProviderType = { kind: "void" } satisfies ProviderTypeExpression;
const unknownProviderType = { kind: "unknown" } satisfies ProviderTypeExpression;
const stringTargetType = csharpStringTargetType();
const intTargetType = csharpSourcePrimitiveTargetType("int32");
const longTargetType = csharpSourcePrimitiveTargetType("int64");
const doubleTargetType = csharpSourcePrimitiveTargetType("float64");
const osTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.os", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "os"));

type NodeOsCallTargetMember = NodejsModuleCallTargetMetadata;

type NodeOsPropertyTargetMember = NodejsModulePropertyTargetMetadata;
type NodeOsCallTargetMetadataRow = Omit<NodejsModuleCallTargetMetadataRow, "declaringType" | "providerParameters" | "targetParameters">;
type NodeOsPropertyTargetMetadataRow = Omit<NodejsModulePropertyTargetMetadataRow, "declaringType">;

export const nodeOsModuleSpecifier = "node:os";
export const nodeOsHomedirExportName = "homedir";
export const nodeOsHomedirSignatureId = "node:os.homedir()";
export const nodeOsPlatformExportName = "platform";
export const nodeOsPlatformSignatureId = "node:os.platform()";

export function nodeOsExports(): readonly ProviderExportDeclaration[] {
  const exports = [
    ...nodeOsCallTargetMembers().map(({ exportName, signatureId, providerReturnType }) => ({
      id: `node:os.${exportName}`,
      name: exportName,
      kind: "function" as const,
      signatures: [{
        id: signatureId,
        parameters: [],
        returnType: providerReturnType,
      }],
    })),
    ...nodeOsPropertyTargetMembers().map(({ exportName, providerType }) => ({
      id: `node:os.${exportName}`,
      name: exportName,
      kind: "value" as const,
      type: providerType,
    })),
    ...nodeOsUnsupportedExportDeclarations(),
  ];
  return [
    ...exports,
    ...nodejsDefaultModuleObjectExports(nodeOsModuleSpecifier, exports),
  ];
}

export function getNodeOsHomedirTargetMember(): TargetMember {
  const member = getNodeOsCallTargetMember(nodeOsHomedirExportName, nodeOsHomedirSignatureId);
  if (member === undefined) {
    throw new Error("Missing C# NodeJS os.homedir target member.");
  }
  return member;
}

export function getNodeOsPlatformTargetMember(): TargetMember {
  const member = getNodeOsCallTargetMember(nodeOsPlatformExportName, nodeOsPlatformSignatureId);
  if (member === undefined) {
    throw new Error("Missing C# NodeJS os.platform target member.");
  }
  return member;
}

export function getNodeOsCallTargetMember(
  exportName: string | undefined,
  signatureId: string | undefined,
): TargetMember | undefined {
  return getNodejsProviderExportSignatureDeclarationTargetMember(
    nodeOsCallTargetMemberByProviderDeclarationIdentity,
    nodeOsModuleSpecifier,
    exportName,
    signatureId,
  );
}

export function getNodeOsPropertyTargetMember(exportName: string | undefined): TargetMember | undefined {
  return getNodejsProviderExportDeclarationTargetMember(
    nodeOsPropertyTargetMemberByProviderDeclarationIdentity,
    nodeOsModuleSpecifier,
    exportName,
  );
}

export function nodeOsCallTargetMembers(): readonly {
  readonly exportName: string;
  readonly signatureId: string;
  readonly providerReturnType: ProviderTypeExpression;
  readonly member: TargetMember;
}[] {
  return [
    osCall({ exportName: "arch", signatureId: "node:os.arch()", targetMemberId: "Tsonic.CSharp.Node.os.arch()", sourceName: "arch", targetName: "arch", providerReturnType: stringProviderType, targetReturnType: stringTargetType }),
    osCall({ exportName: "availableParallelism", signatureId: "node:os.availableParallelism()", targetMemberId: "Tsonic.CSharp.Node.os.availableParallelism()", sourceName: "availableParallelism", targetName: "availableParallelism", providerReturnType: numberProviderType, targetReturnType: intTargetType }),
    osCall({ exportName: "endianness", signatureId: "node:os.endianness()", targetMemberId: "Tsonic.CSharp.Node.os.endianness()", sourceName: "endianness", targetName: "endianness", providerReturnType: stringProviderType, targetReturnType: stringTargetType }),
    osCall({ exportName: "freemem", signatureId: "node:os.freemem()", targetMemberId: "Tsonic.CSharp.Node.os.freemem()", sourceName: "freemem", targetName: "freemem", providerReturnType: numberProviderType, targetReturnType: longTargetType }),
    osCall({ exportName: nodeOsHomedirExportName, signatureId: nodeOsHomedirSignatureId, targetMemberId: "Tsonic.CSharp.Node.os.homedir()", sourceName: "homedir", targetName: "homedir", providerReturnType: stringProviderType, targetReturnType: stringTargetType }),
    osCall({ exportName: "hostname", signatureId: "node:os.hostname()", targetMemberId: "Tsonic.CSharp.Node.os.hostname()", sourceName: "hostname", targetName: "hostname", providerReturnType: stringProviderType, targetReturnType: stringTargetType }),
    osCall({ exportName: "loadavg", signatureId: "node:os.loadavg()", targetMemberId: "Tsonic.CSharp.Node.os.loadavg()", sourceName: "loadavg", targetName: "loadavg", providerReturnType: { kind: "array", elementType: numberProviderType }, targetReturnType: { kind: "array", element: doubleTargetType } }),
    osCall({ exportName: "machine", signatureId: "node:os.machine()", targetMemberId: "Tsonic.CSharp.Node.os.machine()", sourceName: "machine", targetName: "machine", providerReturnType: stringProviderType, targetReturnType: stringTargetType }),
    osCall({ exportName: nodeOsPlatformExportName, signatureId: nodeOsPlatformSignatureId, targetMemberId: "Tsonic.CSharp.Node.os.platform()", sourceName: "platform", targetName: "platform", providerReturnType: stringProviderType, targetReturnType: stringTargetType }),
    osCall({ exportName: "release", signatureId: "node:os.release()", targetMemberId: "Tsonic.CSharp.Node.os.release()", sourceName: "release", targetName: "release", providerReturnType: stringProviderType, targetReturnType: stringTargetType }),
    osCall({ exportName: "tmpdir", signatureId: "node:os.tmpdir()", targetMemberId: "Tsonic.CSharp.Node.os.tmpdir()", sourceName: "tmpdir", targetName: "tmpdir", providerReturnType: stringProviderType, targetReturnType: stringTargetType }),
    osCall({ exportName: "totalmem", signatureId: "node:os.totalmem()", targetMemberId: "Tsonic.CSharp.Node.os.totalmem()", sourceName: "totalmem", targetName: "totalmem", providerReturnType: numberProviderType, targetReturnType: longTargetType }),
    osCall({ exportName: "type", signatureId: "node:os.type()", targetMemberId: "Tsonic.CSharp.Node.os.type()", sourceName: "type", targetName: "type", providerReturnType: stringProviderType, targetReturnType: stringTargetType }),
    osCall({ exportName: "uptime", signatureId: "node:os.uptime()", targetMemberId: "Tsonic.CSharp.Node.os.uptime()", sourceName: "uptime", targetName: "uptime", providerReturnType: numberProviderType, targetReturnType: longTargetType }),
    osCall({ exportName: "version", signatureId: "node:os.version()", targetMemberId: "Tsonic.CSharp.Node.os.version()", sourceName: "version", targetName: "version", providerReturnType: stringProviderType, targetReturnType: stringTargetType }),
  ];
}

export function nodeOsPropertyTargetMembers(): readonly {
  readonly exportName: string;
  readonly providerType: ProviderTypeExpression;
  readonly member: TargetMember;
}[] {
  return [
    osProperty({ exportName: "EOL", targetMemberId: "Tsonic.CSharp.Node.os.EOL", sourceName: "EOL", targetName: "EOL", providerType: stringProviderType, targetReturnType: stringTargetType }),
    osProperty({ exportName: "devNull", targetMemberId: "Tsonic.CSharp.Node.os.devNull", sourceName: "devNull", targetName: "devNull", providerType: stringProviderType, targetReturnType: stringTargetType }),
  ];
}

export function nodeOsUnsupportedTargetIdentities(): readonly NodejsUnsupportedTargetIdentity[] {
  return nodeOsUnsupportedExports.map(({ exportName, signatureId, targetIdentityId, displayName }) => ({
    exportName,
    ...(signatureId !== undefined ? { signatureId } : {}),
    targetIdentityId,
    displayName,
  }));
}

function nodeOsUnsupportedExportDeclarations(): readonly ProviderExportDeclaration[] {
  return nodeOsUnsupportedExports.map((entry) => entry.signatureId === undefined
    ? {
        id: `node:os.${entry.exportName}`,
        name: entry.exportName,
        kind: "value" as const,
        type: entry.providerType,
      }
    : {
        id: `node:os.${entry.exportName}`,
        name: entry.exportName,
        kind: "function" as const,
        signatures: [{
          id: entry.signatureId,
          parameters: entry.providerParameters ?? [],
          returnType: entry.providerType,
        }],
      });
}

function osCall(row: NodeOsCallTargetMetadataRow): NodeOsCallTargetMember {
  return nodejsModuleCallTargetMetadata({
    ...row,
    providerParameters: [],
    targetParameters: [],
    declaringType: osTargetType,
  });
}

function osProperty(row: NodeOsPropertyTargetMetadataRow): NodeOsPropertyTargetMember {
  return nodejsModulePropertyTargetMetadata({
    ...row,
    declaringType: osTargetType,
  });
}

const nodeOsCallTargetMemberByProviderDeclarationIdentity =
  nodejsProviderExportSignatureDeclarationTargetMemberIndex(nodeOsModuleSpecifier, nodeOsCallTargetMembers());

const nodeOsPropertyTargetMemberByProviderDeclarationIdentity =
  nodejsProviderExportDeclarationTargetMemberIndex(nodeOsModuleSpecifier, nodeOsPropertyTargetMembers());

const nodeOsUnsupportedExports = [
  {
    exportName: "constants",
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.os.constants",
    displayName: "unsupported NodeJS os.constants",
    providerType: unknownProviderType,
  },
  {
    exportName: "cpus",
    signatureId: "node:os.cpus()",
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.os.cpus()",
    displayName: "unsupported NodeJS os.cpus",
    providerType: { kind: "array", elementType: unknownProviderType },
  },
  {
    exportName: "networkInterfaces",
    signatureId: "node:os.networkInterfaces()",
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.os.networkInterfaces()",
    displayName: "unsupported NodeJS os.networkInterfaces",
    providerType: unknownProviderType,
  },
  {
    exportName: "userInfo",
    signatureId: "node:os.userInfo(System.Object)",
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.os.userInfo(System.Object)",
    displayName: "unsupported NodeJS os.userInfo",
    providerParameters: [{ name: "options", type: unknownProviderType, optional: true }],
    providerType: unknownProviderType,
  },
  {
    exportName: "getPriority",
    signatureId: "node:os.getPriority(System.Int32)",
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.os.getPriority(System.Int32)",
    displayName: "unsupported NodeJS os.getPriority",
    providerParameters: [{ name: "pid", type: numberProviderType, optional: true }],
    providerType: numberProviderType,
  },
  {
    exportName: "setPriority",
    signatureId: "node:os.setPriority(System.Int32,System.Int32)",
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.os.setPriority(System.Int32,System.Int32)",
    displayName: "unsupported NodeJS os.setPriority",
    providerParameters: [
      { name: "pid", type: numberProviderType },
      { name: "priority", type: numberProviderType },
    ],
    providerType: voidProviderType,
  },
] satisfies readonly {
  readonly exportName: string;
  readonly signatureId?: string;
  readonly targetIdentityId: string;
  readonly displayName: string;
  readonly providerParameters?: readonly ProviderParameterDeclaration[];
  readonly providerType: ProviderTypeExpression;
}[];
