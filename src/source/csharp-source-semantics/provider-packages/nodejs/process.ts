import type {
  ProviderExportDeclaration,
  ProviderParameterDeclaration,
  ProviderTypeExpression,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpNullableTargetType,
  csharpNullableValueTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpVoidTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
  targetParameter,
} from "../../surfaces/js/source-library.js";
import {
  getNodejsProviderExportDeclarationTargetMember,
  getNodejsProviderExportSignatureDeclarationTargetMember,
  nodejsProviderExportDeclarationTargetMemberIndex,
  nodejsProviderExportSignatureDeclarationTargetMemberIndex,
} from "./metadata-indexes.js";
import {
  nodejsClassPropertyTargetMetadata,
  nodejsModuleCallTargetMetadata,
  nodejsModulePropertyTargetMetadata,
} from "./members/target-member-metadata.js";
import {
  nodejsDefaultModuleObjectExports,
} from "./module-defaults.js";
import type {
  NodejsModuleCallTargetMetadata,
  NodejsModuleCallTargetMetadataRow,
  NodejsModulePropertyTargetMetadata,
  NodejsModulePropertyTargetMetadataRow,
} from "./members/target-member-metadata.js";
import type {
  NodejsClassPropertyTargetMember,
} from "./members/types.js";

const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const numberProviderType = { kind: "number" } satisfies ProviderTypeExpression;
const voidProviderType = { kind: "void" } satisfies ProviderTypeExpression;
const boolProviderType = { kind: "boolean" } satisfies ProviderTypeExpression;
const unknownProviderType = { kind: "unknown" } satisfies ProviderTypeExpression;
const undefinedProviderType = { kind: "void" } satisfies ProviderTypeExpression;
const objectTargetType = csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });
const stringTargetType = csharpStringTargetType();
const intTargetType = csharpSourcePrimitiveTargetType("int32");
const longTargetType = csharpSourcePrimitiveTargetType("int64");
const doubleTargetType = csharpSourcePrimitiveTargetType("float64");
const boolTargetType = csharpSourcePrimitiveTargetType("bool");
const voidTargetType = csharpVoidTargetType();
const processTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.process", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "process"));
const processEnvTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.ProcessEnv", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "ProcessEnv"));
const processMemoryUsageTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.MemoryUsage", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "MemoryUsage"));
const processVersionsTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.ProcessVersions", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "ProcessVersions"));
const processEnvProviderType = { kind: "provider-ref", moduleSpecifier: "node:process", exportName: "ProcessEnv" } satisfies ProviderTypeExpression;
const processMemoryUsageProviderType = { kind: "provider-ref", moduleSpecifier: "node:process", exportName: "MemoryUsage" } satisfies ProviderTypeExpression;
const processVersionsProviderType = { kind: "provider-ref", moduleSpecifier: "node:process", exportName: "ProcessVersions" } satisfies ProviderTypeExpression;
const stringOrUndefinedProviderType = { kind: "union", types: [stringProviderType, undefinedProviderType] } satisfies ProviderTypeExpression;
const stringOrNumberProviderType = { kind: "union", types: [stringProviderType, numberProviderType] } satisfies ProviderTypeExpression;

type NodeProcessCallTargetMember = NodejsModuleCallTargetMetadata;
type NodeProcessPropertyTargetMember = NodejsModulePropertyTargetMetadata;
type NodeProcessCallTargetMetadataRow = Omit<NodejsModuleCallTargetMetadataRow, "declaringType">;
type NodeProcessPropertyTargetMetadataRow = Omit<NodejsModulePropertyTargetMetadataRow, "declaringType">;

export interface NodeProcessUnsupportedTargetIdentity {
  readonly exportName: string;
  readonly targetIdentityId: string;
  readonly displayName: string;
}

export const nodeProcessModuleSpecifier = "node:process";
export const nodeProcessCwdExportName = "cwd";
export const nodeProcessCwdSignatureId = "node:process.cwd()";
export const nodeProcessPlatformExportName = "platform";
export const nodeProcessEnvExportName = "env";
export const nodeProcessProcessEnvExportName = "ProcessEnv";
export const nodeProcessMemoryUsageExportName = "memoryUsage";
export const nodeProcessMemoryUsageSignatureId = "node:process.memoryUsage()";
export const nodeProcessProcessMemoryUsageExportName = "MemoryUsage";
export const nodeProcessProcessVersionsExportName = "ProcessVersions";

export function nodeProcessExports(): readonly ProviderExportDeclaration[] {
  const exports = [
    nodeProcessEnvExportDeclaration(),
    nodeProcessMemoryUsageExportDeclaration(),
    nodeProcessVersionsExportDeclaration(),
    ...nodeProcessCallTargetMembers().map(({ exportName, signatureId, providerParameters, providerReturnType }) => ({
      id: `node:process.${exportName}`,
      name: exportName,
      kind: "function" as const,
      signatures: [{
        id: signatureId,
        parameters: providerParameters,
        returnType: providerReturnType,
      }],
    })),
    ...nodeProcessPropertyTargetMembers().map(({ exportName, providerType }) => ({
      id: `node:process.${exportName}`,
      name: exportName,
      kind: "value" as const,
      type: providerType,
    })),
    ...nodeProcessUnsupportedExportDeclarations(),
  ];
  return [
    ...exports,
    ...nodejsDefaultModuleObjectExports(nodeProcessModuleSpecifier, exports),
  ];
}

export function getNodeProcessCwdTargetMember(): TargetMember {
  const member = getNodeProcessCallTargetMember(nodeProcessCwdExportName, nodeProcessCwdSignatureId);
  if (member === undefined) {
    throw new Error("Missing C# NodeJS process.cwd target member.");
  }
  return member;
}

export function getNodeProcessPlatformTargetMember(): TargetMember {
  const member = getNodeProcessPropertyTargetMember(nodeProcessPlatformExportName);
  if (member === undefined) {
    throw new Error("Missing C# NodeJS process.platform target member.");
  }
  return member;
}

export function getNodeProcessCallTargetMember(
  exportName: string | undefined,
  signatureId: string | undefined,
): TargetMember | undefined {
  return getNodejsProviderExportSignatureDeclarationTargetMember(
    nodeProcessCallTargetMemberByProviderDeclarationIdentity,
    nodeProcessModuleSpecifier,
    exportName,
    signatureId,
  );
}

export function getNodeProcessPropertyTargetMember(exportName: string | undefined): TargetMember | undefined {
  return getNodejsProviderExportDeclarationTargetMember(
    nodeProcessPropertyTargetMemberByProviderDeclarationIdentity,
    nodeProcessModuleSpecifier,
    exportName,
  );
}

export function nodeProcessCallTargetMembers(): readonly NodeProcessCallTargetMember[] {
  const stringParameter = (name: string) => ({ name, type: stringProviderType });
  const optionalNumberParameter = (name: string) => ({ name, type: numberProviderType, optional: true });
  return [
    processCall({ exportName: "chdir", signatureId: "node:process.chdir(System.String)", targetMemberId: "Tsonic.CSharp.Node.process.chdir(System.String)", sourceName: "chdir", targetName: "chdir", providerParameters: [stringParameter("directory")], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("directory", stringTargetType),
    ], targetReturnType: voidTargetType }),
    processCall({ exportName: nodeProcessCwdExportName, signatureId: nodeProcessCwdSignatureId, targetMemberId: "Tsonic.CSharp.Node.process.cwd()", sourceName: "cwd", targetName: "cwd", providerParameters: [], providerReturnType: stringProviderType, targetParameters: [], targetReturnType: stringTargetType }),
    processCall({ exportName: "exit", signatureId: "node:process.exit(System.Nullable`1)", targetMemberId: "Tsonic.CSharp.Node.process.exit(System.Nullable`1)", sourceName: "exit", targetName: "exit", providerParameters: [optionalNumberParameter("code")], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("code", csharpNullableValueTargetType(intTargetType), { optional: true }),
    ], targetReturnType: voidTargetType }),
    processCall({ exportName: "kill", signatureId: "node:process.kill(System.Int32,System.Object)", targetMemberId: "Tsonic.CSharp.Node.process.kill(System.Int32,System.Object)", sourceName: "kill", targetName: "kill", providerParameters: [
      { name: "pid", type: numberProviderType },
      { name: "signal", type: stringOrNumberProviderType, optional: true },
    ], providerReturnType: boolProviderType, targetParameters: [
      targetParameter("pid", intTargetType),
      targetParameter("signal", objectTargetType, { optional: true, csharpAcceptsClosedSourceArgument: true }),
    ], targetReturnType: boolTargetType }),
    processCall({ exportName: nodeProcessMemoryUsageExportName, signatureId: nodeProcessMemoryUsageSignatureId, targetMemberId: "Tsonic.CSharp.Node.process.memoryUsage()", sourceName: "memoryUsage", targetName: "memoryUsage", providerParameters: [], providerReturnType: processMemoryUsageProviderType, targetParameters: [], targetReturnType: processMemoryUsageTargetType }),
    processCall({ exportName: "uptime", signatureId: "node:process.uptime()", targetMemberId: "Tsonic.CSharp.Node.process.uptime()", sourceName: "uptime", targetName: "uptime", providerParameters: [], providerReturnType: numberProviderType, targetParameters: [], targetReturnType: doubleTargetType }),
  ];
}

export function nodeProcessPropertyTargetMembers(): readonly NodeProcessPropertyTargetMember[] {
  return [
    processProperty({ exportName: "arch", targetMemberId: "Tsonic.CSharp.Node.process.arch", sourceName: "arch", targetName: "arch", providerType: stringProviderType, targetReturnType: stringTargetType }),
    processProperty({ exportName: "argv", targetMemberId: "Tsonic.CSharp.Node.process.argv", sourceName: "argv", targetName: "argv", providerType: { kind: "array", elementType: stringProviderType }, targetReturnType: { kind: "array", element: stringTargetType } }),
    processProperty({ exportName: "argv0", targetMemberId: "Tsonic.CSharp.Node.process.argv0", sourceName: "argv0", targetName: "argv0", providerType: stringProviderType, targetReturnType: stringTargetType }),
    processProperty({ exportName: nodeProcessEnvExportName, targetMemberId: "Tsonic.CSharp.Node.process.env", sourceName: "env", targetName: "env", providerType: processEnvProviderType, targetReturnType: processEnvTargetType }),
    processProperty({ exportName: "execPath", targetMemberId: "Tsonic.CSharp.Node.process.execPath", sourceName: "execPath", targetName: "execPath", providerType: stringProviderType, targetReturnType: stringTargetType }),
    processProperty({ exportName: "exitCode", targetMemberId: "Tsonic.CSharp.Node.process.exitCode", sourceName: "exitCode", targetName: "exitCode", providerType: { kind: "union", types: [numberProviderType, { kind: "literal", value: null }] }, targetReturnType: csharpNullableValueTargetType(intTargetType) }),
    processProperty({ exportName: "pid", targetMemberId: "Tsonic.CSharp.Node.process.pid", sourceName: "pid", targetName: "pid", providerType: numberProviderType, targetReturnType: intTargetType }),
    processProperty({ exportName: nodeProcessPlatformExportName, targetMemberId: "Tsonic.CSharp.Node.process.platform", sourceName: "platform", targetName: "platform", providerType: stringProviderType, targetReturnType: stringTargetType }),
    processProperty({ exportName: "ppid", targetMemberId: "Tsonic.CSharp.Node.process.ppid", sourceName: "ppid", targetName: "ppid", providerType: numberProviderType, targetReturnType: intTargetType }),
    processProperty({ exportName: "version", targetMemberId: "Tsonic.CSharp.Node.process.version", sourceName: "version", targetName: "version", providerType: stringProviderType, targetReturnType: stringTargetType }),
    processProperty({ exportName: "versions", targetMemberId: "Tsonic.CSharp.Node.process.versions", sourceName: "versions", targetName: "versions", providerType: processVersionsProviderType, targetReturnType: processVersionsTargetType }),
  ];
}

export function nodeProcessUnsupportedTargetIdentities(): readonly NodeProcessUnsupportedTargetIdentity[] {
  return nodeProcessUnsupportedExports.map(({ exportName, signatureId, targetIdentityId, displayName }) => ({
    exportName,
    ...(signatureId !== undefined ? { signatureId } : {}),
    targetIdentityId,
    displayName,
  }));
}

export function nodeProcessClassPropertyTargetMembers(): readonly NodejsClassPropertyTargetMember[] {
  return [
    ...nodeProcessEnvClassPropertyTargetMembers(),
    ...nodeProcessMemoryUsageClassPropertyTargetMembers(),
    ...nodeProcessVersionsClassPropertyTargetMembers(),
  ];
}

function nodeProcessEnvClassPropertyTargetMembers(): readonly NodejsClassPropertyTargetMember[] {
  return [
    nodejsClassPropertyTargetMetadata({
      exportName: nodeProcessProcessEnvExportName,
      memberName: "Item",
      memberId: "Tsonic.CSharp.Node.ProcessEnv.Item(System.String)",
      targetMemberId: "Tsonic.CSharp.Node.ProcessEnv.Item(System.String)",
      sourceName: "Item",
      targetName: "Item",
      memberKind: "indexer",
      providerType: stringOrUndefinedProviderType,
      targetParameters: [targetParameter("key", stringTargetType)],
      targetReturnType: csharpNullableTargetType(stringTargetType),
      declaringType: processEnvTargetType,
    }),
  ];
}

function nodeProcessMemoryUsageClassPropertyTargetMembers(): readonly NodejsClassPropertyTargetMember[] {
  return nodeProcessMemoryUsageClassPropertyTargetMetadataRows.map(nodejsClassPropertyTargetMetadata);
}

const nodeProcessMemoryUsageClassPropertyTargetMetadataRows = [
  { exportName: nodeProcessProcessMemoryUsageExportName, memberName: "rss", memberId: "Tsonic.CSharp.Node.MemoryUsage.rss", targetMemberId: "Tsonic.CSharp.Node.MemoryUsage.rss", sourceName: "rss", targetName: "rss", memberKind: "property", providerType: numberProviderType, targetParameters: [], targetReturnType: longTargetType, declaringType: processMemoryUsageTargetType, readonly: true },
  { exportName: nodeProcessProcessMemoryUsageExportName, memberName: "heapTotal", memberId: "Tsonic.CSharp.Node.MemoryUsage.heapTotal", targetMemberId: "Tsonic.CSharp.Node.MemoryUsage.heapTotal", sourceName: "heapTotal", targetName: "heapTotal", memberKind: "property", providerType: numberProviderType, targetParameters: [], targetReturnType: longTargetType, declaringType: processMemoryUsageTargetType, readonly: true },
  { exportName: nodeProcessProcessMemoryUsageExportName, memberName: "heapUsed", memberId: "Tsonic.CSharp.Node.MemoryUsage.heapUsed", targetMemberId: "Tsonic.CSharp.Node.MemoryUsage.heapUsed", sourceName: "heapUsed", targetName: "heapUsed", memberKind: "property", providerType: numberProviderType, targetParameters: [], targetReturnType: longTargetType, declaringType: processMemoryUsageTargetType, readonly: true },
  { exportName: nodeProcessProcessMemoryUsageExportName, memberName: "external", memberId: "Tsonic.CSharp.Node.MemoryUsage.external", targetMemberId: "Tsonic.CSharp.Node.MemoryUsage.external", sourceName: "external", targetName: "external", memberKind: "property", providerType: numberProviderType, targetParameters: [], targetReturnType: longTargetType, declaringType: processMemoryUsageTargetType, readonly: true },
  { exportName: nodeProcessProcessMemoryUsageExportName, memberName: "arrayBuffers", memberId: "Tsonic.CSharp.Node.MemoryUsage.arrayBuffers", targetMemberId: "Tsonic.CSharp.Node.MemoryUsage.arrayBuffers", sourceName: "arrayBuffers", targetName: "arrayBuffers", memberKind: "property", providerType: numberProviderType, targetParameters: [], targetReturnType: longTargetType, declaringType: processMemoryUsageTargetType, readonly: true },
] satisfies readonly Parameters<typeof nodejsClassPropertyTargetMetadata>[0][];

function nodeProcessVersionsClassPropertyTargetMembers(): readonly NodejsClassPropertyTargetMember[] {
  return [
    nodejsClassPropertyTargetMetadata({
      exportName: nodeProcessProcessVersionsExportName,
      memberName: "node",
      memberId: "Tsonic.CSharp.Node.ProcessVersions.node",
      targetMemberId: "Tsonic.CSharp.Node.ProcessVersions.node",
      sourceName: "node",
      targetName: "node",
      memberKind: "property",
      providerType: stringProviderType,
      targetParameters: [],
      targetReturnType: stringTargetType,
      declaringType: processVersionsTargetType,
      readonly: true,
    }),
    nodejsClassPropertyTargetMetadata({
      exportName: nodeProcessProcessVersionsExportName,
      memberName: "v8",
      memberId: "Tsonic.CSharp.Node.ProcessVersions.v8",
      targetMemberId: "Tsonic.CSharp.Node.ProcessVersions.v8",
      sourceName: "v8",
      targetName: "v8",
      memberKind: "property",
      providerType: stringProviderType,
      targetParameters: [],
      targetReturnType: stringTargetType,
      declaringType: processVersionsTargetType,
      readonly: true,
    }),
    nodejsClassPropertyTargetMetadata({
      exportName: nodeProcessProcessVersionsExportName,
      memberName: "dotnet",
      memberId: "Tsonic.CSharp.Node.ProcessVersions.dotnet",
      targetMemberId: "Tsonic.CSharp.Node.ProcessVersions.dotnet",
      sourceName: "dotnet",
      targetName: "dotnet",
      memberKind: "property",
      providerType: stringProviderType,
      targetParameters: [],
      targetReturnType: stringTargetType,
      declaringType: processVersionsTargetType,
      readonly: true,
    }),
    nodejsClassPropertyTargetMetadata({
      exportName: nodeProcessProcessVersionsExportName,
      memberName: "tsonic",
      memberId: "Tsonic.CSharp.Node.ProcessVersions.tsonic",
      targetMemberId: "Tsonic.CSharp.Node.ProcessVersions.tsonic",
      sourceName: "tsonic",
      targetName: "tsonic",
      memberKind: "property",
      providerType: stringProviderType,
      targetParameters: [],
      targetReturnType: stringTargetType,
      declaringType: processVersionsTargetType,
      readonly: true,
    }),
  ];
}

function nodeProcessEnvExportDeclaration(): ProviderExportDeclaration {
  return {
    id: `node:process.${nodeProcessProcessEnvExportName}`,
    name: nodeProcessProcessEnvExportName,
    kind: "interface",
    targetIdentity: {
      target: "csharp",
      id: processEnvTargetType.id,
      displayName: "Tsonic.CSharp.Node.ProcessEnv",
    },
    members: [{
      id: "Tsonic.CSharp.Node.ProcessEnv.Item(System.String)",
      name: "Item",
      kind: "indexer",
      signatures: [{
        id: "Tsonic.CSharp.Node.ProcessEnv.Item(System.String)",
        parameters: [{ name: "key", type: stringProviderType }],
        returnType: stringOrUndefinedProviderType,
      }],
    }],
  };
}

function nodeProcessMemoryUsageExportDeclaration(): ProviderExportDeclaration {
  return {
    id: `node:process.${nodeProcessProcessMemoryUsageExportName}`,
    name: nodeProcessProcessMemoryUsageExportName,
    kind: "interface",
    targetIdentity: {
      target: "csharp",
      id: processMemoryUsageTargetType.id,
      displayName: "Tsonic.CSharp.Node.MemoryUsage",
    },
    members: nodeProcessMemoryUsageClassPropertyTargetMembers()
      .map((member) => ({
        id: member.memberId,
        name: member.memberName,
        kind: "property" as const,
        readonly: true,
        type: numberProviderType,
      })),
  };
}

function nodeProcessVersionsExportDeclaration(): ProviderExportDeclaration {
  return {
    id: `node:process.${nodeProcessProcessVersionsExportName}`,
    name: nodeProcessProcessVersionsExportName,
    kind: "interface",
    targetIdentity: {
      target: "csharp",
      id: processVersionsTargetType.id,
      displayName: "Tsonic.CSharp.Node.ProcessVersions",
    },
    members: nodeProcessVersionsClassPropertyTargetMembers()
      .map((member) => ({
        id: member.memberId,
        name: member.memberName,
        kind: "property" as const,
        readonly: true,
        type: stringProviderType,
      })),
  };
}

function nodeProcessUnsupportedExportDeclarations(): readonly ProviderExportDeclaration[] {
  return nodeProcessUnsupportedExports.map((entry) => entry.signatureId === undefined
    ? {
        id: `node:process.${entry.exportName}`,
        name: entry.exportName,
        kind: "value" as const,
        type: entry.providerType,
      }
    : {
        id: `node:process.${entry.exportName}`,
        name: entry.exportName,
        kind: "function" as const,
        signatures: [{
          id: entry.signatureId,
          parameters: entry.providerParameters ?? [],
          returnType: entry.providerType,
        }],
      });
}

function unknownRestParameter(name: string): ProviderParameterDeclaration {
  return {
    name,
    type: { kind: "array", elementType: unknownProviderType },
    rest: true,
  };
}

function processCall(row: NodeProcessCallTargetMetadataRow): NodeProcessCallTargetMember {
  return nodejsModuleCallTargetMetadata({
    ...row,
    declaringType: processTargetType,
  });
}

function processProperty(row: NodeProcessPropertyTargetMetadataRow): NodeProcessPropertyTargetMember {
  return nodejsModulePropertyTargetMetadata({
    ...row,
    declaringType: processTargetType,
  });
}

const nodeProcessCallTargetMemberByProviderDeclarationIdentity =
  nodejsProviderExportSignatureDeclarationTargetMemberIndex(nodeProcessModuleSpecifier, nodeProcessCallTargetMembers());

const nodeProcessPropertyTargetMemberByProviderDeclarationIdentity =
  nodejsProviderExportDeclarationTargetMemberIndex(nodeProcessModuleSpecifier, nodeProcessPropertyTargetMembers());

const nodeProcessUnsupportedExports = [
  {
    exportName: "stdin",
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.process.stdin",
    displayName: "unsupported NodeJS process.stdin",
    providerType: unknownProviderType,
  },
  {
    exportName: "stdout",
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.process.stdout",
    displayName: "unsupported NodeJS process.stdout",
    providerType: unknownProviderType,
  },
  {
    exportName: "stderr",
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.process.stderr",
    displayName: "unsupported NodeJS process.stderr",
    providerType: unknownProviderType,
  },
  {
    exportName: "hrtime",
    signatureId: "node:process.hrtime(System.Int32[])",
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.process.hrtime(System.Int32[])",
    displayName: "unsupported NodeJS process.hrtime",
    providerParameters: [{ name: "time", type: { kind: "array", elementType: numberProviderType }, optional: true }],
    providerType: { kind: "array", elementType: numberProviderType },
  },
  {
    exportName: "nextTick",
    signatureId: "node:process.nextTick(Function,System.Object[])",
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.process.nextTick(Function,System.Object[])",
    displayName: "unsupported NodeJS process.nextTick",
    providerParameters: [
      { name: "callback", type: { kind: "function", parameters: [], returnType: voidProviderType } },
      unknownRestParameter("args"),
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
