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
} from "../js/source-library.js";
import {
  getNodejsProviderExportDeclarationTargetMember,
  getNodejsProviderExportSignatureDeclarationTargetMember,
  nodejsProviderExportDeclarationTargetMemberIndex,
  nodejsProviderExportSignatureDeclarationTargetMemberIndex,
} from "./metadata-indexes.js";

const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const numberProviderType = { kind: "number" } satisfies ProviderTypeExpression;
const stringTargetType = csharpStringTargetType();
const intTargetType = csharpSourcePrimitiveTargetType("int32");
const longTargetType = csharpSourcePrimitiveTargetType("int64");
const doubleTargetType = csharpSourcePrimitiveTargetType("float64");
const osTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.os", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "os"));

interface NodeOsCallTargetMember {
  readonly exportName: string;
  readonly signatureId: string;
  readonly targetMemberId: string;
  readonly targetName: string;
  readonly providerReturnType: ProviderTypeExpression;
  readonly member: TargetMember;
}

interface NodeOsPropertyTargetMember {
  readonly exportName: string;
  readonly targetMemberId: string;
  readonly targetName: string;
  readonly providerType: ProviderTypeExpression;
  readonly member: TargetMember;
}

export const nodeOsModuleSpecifier = "node:os";
export const nodeOsHomedirExportName = "homedir";
export const nodeOsHomedirSignatureId = "node:os.homedir()";
export const nodeOsPlatformExportName = "platform";
export const nodeOsPlatformSignatureId = "node:os.platform()";

export function nodeOsExports(): readonly ProviderExportDeclaration[] {
  return [
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
    osCall("arch", "node:os.arch()", "Tsonic.CSharp.Node.os.arch()", "arch", stringProviderType, stringTargetType),
    osCall("availableParallelism", "node:os.availableParallelism()", "Tsonic.CSharp.Node.os.availableParallelism()", "availableParallelism", numberProviderType, intTargetType),
    osCall("endianness", "node:os.endianness()", "Tsonic.CSharp.Node.os.endianness()", "endianness", stringProviderType, stringTargetType),
    osCall("freemem", "node:os.freemem()", "Tsonic.CSharp.Node.os.freemem()", "freemem", numberProviderType, longTargetType),
    osCall(nodeOsHomedirExportName, nodeOsHomedirSignatureId, "Tsonic.CSharp.Node.os.homedir()", "homedir", stringProviderType, stringTargetType),
    osCall("hostname", "node:os.hostname()", "Tsonic.CSharp.Node.os.hostname()", "hostname", stringProviderType, stringTargetType),
    osCall("loadavg", "node:os.loadavg()", "Tsonic.CSharp.Node.os.loadavg()", "loadavg", { kind: "array", elementType: numberProviderType }, { kind: "array", element: doubleTargetType }),
    osCall("machine", "node:os.machine()", "Tsonic.CSharp.Node.os.machine()", "machine", stringProviderType, stringTargetType),
    osCall(nodeOsPlatformExportName, nodeOsPlatformSignatureId, "Tsonic.CSharp.Node.os.platform()", "platform", stringProviderType, stringTargetType),
    osCall("release", "node:os.release()", "Tsonic.CSharp.Node.os.release()", "release", stringProviderType, stringTargetType),
    osCall("tmpdir", "node:os.tmpdir()", "Tsonic.CSharp.Node.os.tmpdir()", "tmpdir", stringProviderType, stringTargetType),
    osCall("totalmem", "node:os.totalmem()", "Tsonic.CSharp.Node.os.totalmem()", "totalmem", numberProviderType, longTargetType),
    osCall("type", "node:os.type()", "Tsonic.CSharp.Node.os.type()", "type", stringProviderType, stringTargetType),
    osCall("uptime", "node:os.uptime()", "Tsonic.CSharp.Node.os.uptime()", "uptime", numberProviderType, longTargetType),
    osCall("version", "node:os.version()", "Tsonic.CSharp.Node.os.version()", "version", stringProviderType, stringTargetType),
  ];
}

export function nodeOsPropertyTargetMembers(): readonly {
  readonly exportName: string;
  readonly providerType: ProviderTypeExpression;
  readonly member: TargetMember;
}[] {
  return [
    osProperty("EOL", "Tsonic.CSharp.Node.os.EOL", "EOL", stringProviderType, stringTargetType),
    osProperty("devNull", "Tsonic.CSharp.Node.os.devNull", "devNull", stringProviderType, stringTargetType),
  ];
}

function osCall(
  sourceName: string,
  signatureId: string,
  targetMemberId: string,
  targetName: string,
  providerReturnType: ProviderTypeExpression,
  targetReturnType: TargetTypeRef,
): NodeOsCallTargetMember {
  return {
    exportName: sourceName,
    signatureId,
    targetMemberId,
    targetName,
    providerReturnType,
    member: {
      id: targetMemberId,
      sourceName,
      targetName,
      kind: "method",
      parameters: [],
      returnType: targetReturnType,
      declaringType: osTargetType,
      static: true,
    },
  };
}

function osProperty(
  sourceName: string,
  targetMemberId: string,
  targetName: string,
  providerType: ProviderTypeExpression,
  targetType: TargetTypeRef,
): NodeOsPropertyTargetMember {
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
      declaringType: osTargetType,
      static: true,
    },
  };
}

const nodeOsCallTargetMemberByProviderDeclarationIdentity =
  nodejsProviderExportSignatureDeclarationTargetMemberIndex(nodeOsModuleSpecifier, nodeOsCallTargetMembers());

const nodeOsPropertyTargetMemberByProviderDeclarationIdentity =
  nodejsProviderExportDeclarationTargetMemberIndex(nodeOsModuleSpecifier, nodeOsPropertyTargetMembers());
