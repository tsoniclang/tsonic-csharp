import type {
  ProviderExportDeclaration,
  ProviderTypeExpression,
  TargetBindingFact,
  TargetMember,
  TargetTypeRef,
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
} from "../js/source-library.js";
import type {
  CsharpTargetNamedTypeRef,
} from "../js/source-library.js";
import {
  getNodejsProviderExportDeclarationTargetMember,
  getNodejsProviderExportSignatureDeclarationTargetMember,
  nodejsProviderExportDeclarationTargetMemberIndex,
  nodejsProviderExportSignatureDeclarationTargetMemberIndex,
} from "./metadata-indexes.js";
import type {
  NodejsClassPropertyTargetMember,
} from "./members/types.js";

const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const numberProviderType = { kind: "number" } satisfies ProviderTypeExpression;
const voidProviderType = { kind: "void" } satisfies ProviderTypeExpression;
const boolProviderType = { kind: "boolean" } satisfies ProviderTypeExpression;
const undefinedProviderType = { kind: "void" } satisfies ProviderTypeExpression;
const objectTargetType = csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });
const stringTargetType = csharpStringTargetType();
const intTargetType = csharpSourcePrimitiveTargetType("int32");
const boolTargetType = csharpSourcePrimitiveTargetType("bool");
const voidTargetType = csharpVoidTargetType();
const processTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.process", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "process"));
const processEnvTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.ProcessEnv", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "ProcessEnv"));
const processVersionsTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.ProcessVersions", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "ProcessVersions"));
const processEnvProviderType = { kind: "provider-ref", name: "ProcessEnv" } satisfies ProviderTypeExpression;
const processVersionsProviderType = { kind: "provider-ref", name: "ProcessVersions" } satisfies ProviderTypeExpression;
const stringOrUndefinedProviderType = { kind: "union", types: [stringProviderType, undefinedProviderType] } satisfies ProviderTypeExpression;
const stringOrNumberProviderType = { kind: "union", types: [stringProviderType, numberProviderType] } satisfies ProviderTypeExpression;

interface NodeProcessProviderParameter {
  readonly name: string;
  readonly type: ProviderTypeExpression;
  readonly optional?: boolean;
}

interface NodeProcessCallTargetMember {
  readonly exportName: string;
  readonly signatureId: string;
  readonly targetMemberId: string;
  readonly targetName: string;
  readonly providerParameters: readonly NodeProcessProviderParameter[];
  readonly providerReturnType: ProviderTypeExpression;
  readonly member: TargetMember;
}

interface NodeProcessPropertyTargetMember {
  readonly exportName: string;
  readonly targetMemberId: string;
  readonly targetName: string;
  readonly providerType: ProviderTypeExpression;
  readonly member: TargetMember;
}

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
export const nodeProcessProcessVersionsExportName = "ProcessVersions";

export function nodeProcessExports(): readonly ProviderExportDeclaration[] {
  return [
    nodeProcessEnvExportDeclaration(),
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
    processCall("chdir", "node:process.chdir(System.String)", "Tsonic.CSharp.Node.process.chdir(System.String)", "chdir", [stringParameter("directory")], voidProviderType, [
      targetParameter("directory", stringTargetType),
    ], voidTargetType),
    processCall(nodeProcessCwdExportName, nodeProcessCwdSignatureId, "Tsonic.CSharp.Node.process.cwd()", "cwd", [], stringProviderType, [], stringTargetType),
    processCall("exit", "node:process.exit(System.Nullable`1)", "Tsonic.CSharp.Node.process.exit(System.Nullable`1)", "exit", [optionalNumberParameter("code")], voidProviderType, [
      targetParameter("code", csharpNullableValueTargetType(intTargetType), { optional: true }),
    ], voidTargetType),
    processCall("kill", "node:process.kill(System.Int32,System.Object)", "Tsonic.CSharp.Node.process.kill(System.Int32,System.Object)", "kill", [
      { name: "pid", type: numberProviderType },
      { name: "signal", type: stringOrNumberProviderType, optional: true },
    ], boolProviderType, [
      targetParameter("pid", intTargetType),
      targetParameter("signal", objectTargetType, { optional: true, csharpAcceptsClosedSourceArgument: true }),
    ], boolTargetType),
  ];
}

export function nodeProcessPropertyTargetMembers(): readonly NodeProcessPropertyTargetMember[] {
  return [
    processProperty("arch", "Tsonic.CSharp.Node.process.arch", "arch", stringProviderType, stringTargetType),
    processProperty("argv", "Tsonic.CSharp.Node.process.argv", "argv", { kind: "array", elementType: stringProviderType }, { kind: "array", element: stringTargetType }),
    processProperty("argv0", "Tsonic.CSharp.Node.process.argv0", "argv0", stringProviderType, stringTargetType),
    processProperty(nodeProcessEnvExportName, "Tsonic.CSharp.Node.process.env", "env", processEnvProviderType, processEnvTargetType),
    processProperty("execPath", "Tsonic.CSharp.Node.process.execPath", "execPath", stringProviderType, stringTargetType),
    processProperty("exitCode", "Tsonic.CSharp.Node.process.exitCode", "exitCode", { kind: "union", types: [numberProviderType, { kind: "literal", value: null }] }, csharpNullableValueTargetType(intTargetType)),
    processProperty("pid", "Tsonic.CSharp.Node.process.pid", "pid", numberProviderType, intTargetType),
    processProperty(nodeProcessPlatformExportName, "Tsonic.CSharp.Node.process.platform", "platform", stringProviderType, stringTargetType),
    processProperty("ppid", "Tsonic.CSharp.Node.process.ppid", "ppid", numberProviderType, intTargetType),
    processProperty("version", "Tsonic.CSharp.Node.process.version", "version", stringProviderType, stringTargetType),
    processProperty("versions", "Tsonic.CSharp.Node.process.versions", "versions", processVersionsProviderType, processVersionsTargetType),
  ];
}

export function nodeProcessUnsupportedTargetIdentities(): readonly NodeProcessUnsupportedTargetIdentity[] {
  return [];
}

export function nodeProcessClassPropertyTargetMembers(): readonly NodejsClassPropertyTargetMember[] {
  return [
    ...nodeProcessEnvClassPropertyTargetMembers(),
    ...nodeProcessVersionsClassPropertyTargetMembers(),
  ];
}

function nodeProcessEnvClassPropertyTargetMembers(): readonly NodejsClassPropertyTargetMember[] {
  return [
    processClassProperty(
      nodeProcessProcessEnvExportName,
      "Item",
      "Tsonic.CSharp.Node.ProcessEnv.Item(System.String)",
      "Item",
      "indexer",
      [targetParameter("key", stringTargetType)],
      csharpNullableTargetType(stringTargetType),
    ),
  ];
}

function nodeProcessVersionsClassPropertyTargetMembers(): readonly NodejsClassPropertyTargetMember[] {
  return [
    processClassProperty(
      nodeProcessProcessVersionsExportName,
      "node",
      "Tsonic.CSharp.Node.ProcessVersions.node",
      "node",
      "property",
      [],
      stringTargetType,
      true,
    ),
    processClassProperty(
      nodeProcessProcessVersionsExportName,
      "v8",
      "Tsonic.CSharp.Node.ProcessVersions.v8",
      "v8",
      "property",
      [],
      stringTargetType,
      true,
    ),
    processClassProperty(
      nodeProcessProcessVersionsExportName,
      "dotnet",
      "Tsonic.CSharp.Node.ProcessVersions.dotnet",
      "dotnet",
      "property",
      [],
      stringTargetType,
      true,
    ),
    processClassProperty(
      nodeProcessProcessVersionsExportName,
      "tsonic",
      "Tsonic.CSharp.Node.ProcessVersions.tsonic",
      "tsonic",
      "property",
      [],
      stringTargetType,
      true,
    ),
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
    targetBinding: processClassTargetBinding(nodeProcessProcessEnvExportName, processEnvTargetType, "interface", nodeProcessEnvClassPropertyTargetMembers()),
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
    targetBinding: processClassTargetBinding(nodeProcessProcessVersionsExportName, processVersionsTargetType, "interface", nodeProcessVersionsClassPropertyTargetMembers()),
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

function processClassTargetBinding(
  sourceName: string,
  targetType: CsharpTargetNamedTypeRef,
  kind: TargetBindingFact["kind"],
  members: readonly NodejsClassPropertyTargetMember[],
): TargetBindingFact {
  return {
    id: targetType.id,
    sourceName,
    targetName: targetType.id,
    target: "csharp",
    kind,
    members: members.map((member) => member.member),
  };
}

function processCall(
  sourceName: string,
  signatureId: string,
  targetMemberId: string,
  targetName: string,
  providerParameters: readonly NodeProcessProviderParameter[],
  providerReturnType: ProviderTypeExpression,
  targetParameters: readonly ReturnType<typeof targetParameter>[],
  targetReturnType: TargetTypeRef,
): NodeProcessCallTargetMember {
  return {
    exportName: sourceName,
    signatureId,
    targetMemberId,
    targetName,
    providerParameters,
    providerReturnType,
    member: {
      id: targetMemberId,
      sourceName,
      targetName,
      kind: "method",
      parameters: targetParameters,
      returnType: targetReturnType,
      declaringType: processTargetType,
      static: true,
    },
  };
}

function processProperty(
  sourceName: string,
  targetMemberId: string,
  targetName: string,
  providerType: ProviderTypeExpression,
  targetType: TargetTypeRef,
): NodeProcessPropertyTargetMember {
  return {
    exportName: sourceName,
    targetMemberId,
    targetName,
    providerType,
    member: {
      id: targetMemberId,
      sourceName,
      targetName,
      kind: "property",
      parameters: [],
      returnType: targetType,
      declaringType: processTargetType,
      static: true,
    },
  };
}

function processClassProperty(
  exportName: string,
  sourceMemberName: string,
  memberId: string,
  targetName: string,
  kind: "property" | "indexer",
  parameters: readonly ReturnType<typeof targetParameter>[],
  returnType: TargetTypeRef,
  readonly: boolean = false,
): NodejsClassPropertyTargetMember {
  return {
    exportName,
    memberName: sourceMemberName,
    memberId,
    member: {
      id: memberId,
      sourceName: sourceMemberName,
      targetName,
      kind,
      parameters,
      returnType,
      declaringType: exportName === nodeProcessProcessEnvExportName ? processEnvTargetType : processVersionsTargetType,
      ...(readonly ? { readonly: true } : {}),
    },
  };
}

const nodeProcessCallTargetMemberByProviderDeclarationIdentity =
  nodejsProviderExportSignatureDeclarationTargetMemberIndex(nodeProcessModuleSpecifier, nodeProcessCallTargetMembers());

const nodeProcessPropertyTargetMemberByProviderDeclarationIdentity =
  nodejsProviderExportDeclarationTargetMemberIndex(nodeProcessModuleSpecifier, nodeProcessPropertyTargetMembers());
