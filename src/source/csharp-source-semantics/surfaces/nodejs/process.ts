import type {
  ProviderExportDeclaration,
  ProviderTypeExpression,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpNullableValueTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpVoidTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
  targetParameter,
} from "../js/source-library.js";

const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const numberProviderType = { kind: "number" } satisfies ProviderTypeExpression;
const voidProviderType = { kind: "void" } satisfies ProviderTypeExpression;
const objectProviderType = { kind: "object" } satisfies ProviderTypeExpression;
const stringTargetType = csharpStringTargetType();
const intTargetType = csharpSourcePrimitiveTargetType("int32");
const voidTargetType = csharpVoidTargetType();
const processTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.process", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "process"));

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

export function nodeProcessExports(): readonly ProviderExportDeclaration[] {
  return [
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
    ...nodeProcessUnsupportedValueDeclarations(),
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
  if (signatureId === undefined) {
    return undefined;
  }
  return nodeProcessCallTargetMembers()
    .find((entry) => entry.exportName === exportName && entry.signatureId === signatureId)
    ?.member;
}

export function getNodeProcessPropertyTargetMember(exportName: string | undefined): TargetMember | undefined {
  return nodeProcessPropertyTargetMembers().find((entry) => entry.exportName === exportName)?.member;
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
    processProperty("execPath", stringProviderType, stringTargetType),
    processProperty("exitCode", { kind: "union", types: [numberProviderType, { kind: "literal", value: null }] }, csharpNullableValueTargetType(intTargetType)),
    processProperty("pid", numberProviderType, intTargetType),
    processProperty(nodeProcessPlatformExportName, stringProviderType, stringTargetType),
    processProperty("ppid", numberProviderType, intTargetType),
    processProperty("version", stringProviderType, stringTargetType),
  ];
}

export function nodeProcessUnsupportedTargetIdentities(): readonly NodeProcessUnsupportedTargetIdentity[] {
  return [{
    exportName: nodeProcessEnvExportName,
    targetIdentityId: "unsupported:Tsonic.CSharp.Node.process.env",
    displayName: "unsupported NodeJS process.env",
  }];
}

function nodeProcessUnsupportedValueDeclarations(): readonly ProviderExportDeclaration[] {
  return [{
    id: `node:process.${nodeProcessEnvExportName}`,
    name: nodeProcessEnvExportName,
    kind: "value",
    type: objectProviderType,
  }];
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
