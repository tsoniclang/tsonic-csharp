import type {
  ProviderExportDeclaration,
  ProviderTypeExpression,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
  targetMethod,
  targetParameter,
  targetProperty,
} from "../js/source-library.js";

const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const boolProviderType = { kind: "boolean" } satisfies ProviderTypeExpression;
const stringTargetType = csharpStringTargetType();
const boolTargetType = csharpSourcePrimitiveTargetType("bool");
const pathTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.path", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "path"));

interface NodePathProviderParameter {
  readonly name: string;
  readonly type: ProviderTypeExpression;
  readonly optional?: boolean;
  readonly rest?: boolean;
}

interface NodePathCallTargetMember {
  readonly exportName: string;
  readonly signatureId: string;
  readonly providerParameters: readonly NodePathProviderParameter[];
  readonly providerReturnType: ProviderTypeExpression;
  readonly member: TargetMember;
}

interface NodePathPropertyTargetMember {
  readonly exportName: string;
  readonly providerType: ProviderTypeExpression;
  readonly member: TargetMember;
}

export const nodePathModuleSpecifier = "node:path";
export const nodePathJoinExportName = "join";
export const nodePathJoinSignatureId = "node:path.join(System.String[])";

export function nodePathExports(): readonly ProviderExportDeclaration[] {
  return [
    ...nodePathCallTargetMembers().map(({ exportName, signatureId, providerParameters, providerReturnType }) => ({
      id: `node:path.${exportName}`,
      name: exportName,
      kind: "function" as const,
      signatures: [{
        id: signatureId,
        parameters: providerParameters,
        returnType: providerReturnType,
      }],
    })),
    ...nodePathPropertyTargetMembers().map(({ exportName, providerType }) => ({
      id: `node:path.${exportName}`,
      name: exportName,
      kind: "value" as const,
      type: providerType,
    })),
  ];
}

export function getNodePathJoinTargetMember(): TargetMember {
  const member = getNodePathCallTargetMember(nodePathJoinExportName, nodePathJoinSignatureId);
  if (member === undefined) {
    throw new Error("Missing C# NodeJS path.join target member.");
  }
  return member;
}

export function getNodePathCallTargetMember(
  exportName: string | undefined,
  signatureId: string | undefined,
): TargetMember | undefined {
  return nodePathCallTargetMembers()
    .find((entry) => entry.exportName === exportName && (signatureId === undefined || entry.signatureId === signatureId))
    ?.member;
}

export function getNodePathPropertyTargetMember(exportName: string | undefined): TargetMember | undefined {
  return nodePathPropertyTargetMembers().find((entry) => entry.exportName === exportName)?.member;
}

export function nodePathCallTargetMembers(): readonly {
  readonly exportName: string;
  readonly signatureId: string;
  readonly providerParameters: readonly NodePathProviderParameter[];
  readonly providerReturnType: ProviderTypeExpression;
  readonly member: TargetMember;
}[] {
  const stringRestParameter = {
    name: "paths",
    type: { kind: "array", elementType: stringProviderType } satisfies ProviderTypeExpression,
    rest: true,
  };
  const stringParameter = (name: string) => ({ name, type: stringProviderType });
  const optionalStringParameter = (name: string) => ({ name, type: stringProviderType, optional: true });
  return [
    pathCall("basename", "node:path.basename(System.String,System.String)", [stringParameter("path"), optionalStringParameter("suffix")], stringProviderType, [
      targetParameter("path", stringTargetType),
      targetParameter("suffix", stringTargetType, { optional: true }),
    ], stringTargetType),
    pathCall("dirname", "node:path.dirname(System.String)", [stringParameter("path")], stringProviderType, [
      targetParameter("path", stringTargetType),
    ], stringTargetType),
    pathCall("extname", "node:path.extname(System.String)", [stringParameter("path")], stringProviderType, [
      targetParameter("path", stringTargetType),
    ], stringTargetType),
    pathCall("isAbsolute", "node:path.isAbsolute(System.String)", [stringParameter("path")], boolProviderType, [
      targetParameter("path", stringTargetType),
    ], boolTargetType),
    pathCall(nodePathJoinExportName, nodePathJoinSignatureId, [stringRestParameter], stringProviderType, [
      targetParameter("paths", stringTargetType, { paramsArray: true }),
    ], stringTargetType),
    pathCall("matchesGlob", "node:path.matchesGlob(System.String,System.String)", [stringParameter("path"), stringParameter("pattern")], boolProviderType, [
      targetParameter("path", stringTargetType),
      targetParameter("pattern", stringTargetType),
    ], boolTargetType),
    pathCall("normalize", "node:path.normalize(System.String)", [stringParameter("path")], stringProviderType, [
      targetParameter("path", stringTargetType),
    ], stringTargetType),
    pathCall("relative", "node:path.relative(System.String,System.String)", [stringParameter("from"), stringParameter("to")], stringProviderType, [
      targetParameter("from", stringTargetType),
      targetParameter("to", stringTargetType),
    ], stringTargetType),
    pathCall("resolve", "node:path.resolve(System.String[])", [stringRestParameter], stringProviderType, [
      targetParameter("paths", stringTargetType, { paramsArray: true }),
    ], stringTargetType),
    pathCall("toNamespacedPath", "node:path.toNamespacedPath(System.String)", [stringParameter("path")], stringProviderType, [
      targetParameter("path", stringTargetType),
    ], stringTargetType),
  ];
}

export function nodePathPropertyTargetMembers(): readonly {
  readonly exportName: string;
  readonly providerType: ProviderTypeExpression;
  readonly member: TargetMember;
}[] {
  return [
    pathProperty("sep", stringProviderType, stringTargetType),
    pathProperty("delimiter", stringProviderType, stringTargetType),
  ];
}

function pathCall(
  exportName: string,
  signatureId: string,
  providerParameters: readonly NodePathProviderParameter[],
  providerReturnType: ProviderTypeExpression,
  targetParameters: readonly ReturnType<typeof targetParameter>[],
  targetReturnType: TargetTypeRef,
): NodePathCallTargetMember {
  return {
    exportName,
    signatureId,
    providerParameters,
    providerReturnType,
    member: targetMethod(
      `Tsonic.CSharp.Node.path.${exportName}(${signatureId.slice("node:path.".length + exportName.length + 1, -1)})`,
      exportName,
      exportName,
      targetParameters,
      targetReturnType,
      {
        declaringType: pathTargetType,
        static: true,
      },
    ),
  };
}

function pathProperty(
  exportName: string,
  providerType: ProviderTypeExpression,
  targetType: TargetTypeRef,
): NodePathPropertyTargetMember {
  return {
    exportName,
    providerType,
    member: targetProperty(`Tsonic.CSharp.Node.path.${exportName}`, exportName, exportName, targetType, {
      declaringType: pathTargetType,
      static: true,
    }),
  };
}
