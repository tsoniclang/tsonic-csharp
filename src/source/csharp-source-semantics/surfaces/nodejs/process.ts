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
  readonly providerParameters: readonly NodeProcessProviderParameter[];
  readonly providerReturnType: ProviderTypeExpression;
  readonly member: TargetMember;
}

interface NodeProcessPropertyTargetMember {
  readonly exportName: string;
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

export function nodeProcessCallTargetMembers(): readonly {
  readonly exportName: string;
  readonly signatureId: string;
  readonly targetMemberId: string;
  readonly providerParameters: readonly NodeProcessProviderParameter[];
  readonly providerReturnType: ProviderTypeExpression;
  readonly member: TargetMember;
}[] {
  const stringParameter = (name: string) => ({ name, type: stringProviderType });
  const optionalNumberParameter = (name: string) => ({ name, type: numberProviderType, optional: true });
  return [
    processCall("chdir", "node:process.chdir(System.String)", "Tsonic.CSharp.Node.process.chdir(System.String)", [stringParameter("directory")], voidProviderType, [
      targetParameter("directory", stringTargetType),
    ], voidTargetType),
    processCall(nodeProcessCwdExportName, nodeProcessCwdSignatureId, "Tsonic.CSharp.Node.process.cwd()", [], stringProviderType, [], stringTargetType),
    processCall("exit", "node:process.exit(System.Nullable`1)", "Tsonic.CSharp.Node.process.exit(System.Nullable`1)", [optionalNumberParameter("code")], voidProviderType, [
      targetParameter("code", csharpNullableValueTargetType(intTargetType), { optional: true }),
    ], voidTargetType),
    processCall("kill", "node:process.kill(System.Int32,System.Object)", "Tsonic.CSharp.Node.process.kill(System.Int32,System.Object)", [
      { name: "pid", type: numberProviderType },
      { name: "signal", type: stringOrNumberProviderType, optional: true },
    ], boolProviderType, [
      targetParameter("pid", intTargetType),
      targetParameter("signal", objectTargetType, { optional: true, csharpAcceptsClosedSourceArgument: true }),
    ], boolTargetType),
  ];
}

export function nodeProcessPropertyTargetMembers(): readonly {
  readonly exportName: string;
  readonly providerType: ProviderTypeExpression;
  readonly member: TargetMember;
}[] {
  return [
    processProperty("arch", stringProviderType, stringTargetType),
    processProperty("argv", { kind: "array", elementType: stringProviderType }, { kind: "array", element: stringTargetType }),
    processProperty("argv0", stringProviderType, stringTargetType),
    processProperty(nodeProcessEnvExportName, processEnvProviderType, processEnvTargetType),
    processProperty("execPath", stringProviderType, stringTargetType),
    processProperty("exitCode", { kind: "union", types: [numberProviderType, { kind: "literal", value: null }] }, csharpNullableValueTargetType(intTargetType)),
    processProperty("pid", numberProviderType, intTargetType),
    processProperty(nodeProcessPlatformExportName, stringProviderType, stringTargetType),
    processProperty("ppid", numberProviderType, intTargetType),
    processProperty("version", stringProviderType, stringTargetType),
    processProperty("versions", processVersionsProviderType, processVersionsTargetType),
  ];
}

export function nodeProcessUnsupportedTargetIdentities(): readonly NodeProcessUnsupportedTargetIdentity[] {
  return [];
}

export function nodeProcessClassPropertyTargetMembers(): readonly NodejsClassPropertyTargetMember[] {
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
    targetBinding: processClassTargetBinding(nodeProcessProcessEnvExportName, processEnvTargetType, "interface"),
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
    targetBinding: processClassTargetBinding(nodeProcessProcessVersionsExportName, processVersionsTargetType, "interface"),
    members: nodeProcessClassPropertyTargetMembers()
      .filter((member) => member.exportName === nodeProcessProcessVersionsExportName)
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
): TargetBindingFact {
  return {
    id: targetType.id,
    sourceName,
    targetName: targetType.id,
    target: "csharp",
    kind,
    members: nodeProcessClassPropertyTargetMembers()
      .filter((member) => member.exportName === sourceName)
      .map((member) => member.member),
  };
}

function processCall(
  exportName: string,
  signatureId: string,
  targetMemberId: string,
  providerParameters: readonly NodeProcessProviderParameter[],
  providerReturnType: ProviderTypeExpression,
  targetParameters: readonly ReturnType<typeof targetParameter>[],
  targetReturnType: TargetTypeRef,
): NodeProcessCallTargetMember {
  return {
    exportName,
    signatureId,
    targetMemberId,
    providerParameters,
    providerReturnType,
    member: {
      id: targetMemberId,
      sourceName: exportName,
      targetName: exportName,
      kind: "method",
      parameters: targetParameters,
      returnType: targetReturnType,
      declaringType: processTargetType,
      static: true,
    },
  };
}

function processProperty(
  exportName: string,
  providerType: ProviderTypeExpression,
  targetType: TargetTypeRef,
): NodeProcessPropertyTargetMember {
  return {
    exportName,
    providerType,
    member: {
      id: `Tsonic.CSharp.Node.process.${exportName}`,
      sourceName: exportName,
      targetName: exportName,
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
  memberName: string,
  memberId: string,
  targetName: string,
  kind: "property" | "indexer",
  parameters: readonly ReturnType<typeof targetParameter>[],
  returnType: TargetTypeRef,
  readonly: boolean = false,
): NodejsClassPropertyTargetMember {
  return {
    exportName,
    memberName,
    memberId,
    member: {
      id: memberId,
      sourceName: memberName,
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
