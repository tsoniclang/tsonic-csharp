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
  targetProperty,
} from "../js/source-library.js";

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
  readonly providerReturnType: ProviderTypeExpression;
  readonly member: TargetMember;
}

interface NodeOsPropertyTargetMember {
  readonly exportName: string;
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
  return nodeOsCallTargetMembers()
    .find((entry) => entry.exportName === exportName && (signatureId === undefined || entry.signatureId === signatureId))
    ?.member;
}

export function getNodeOsPropertyTargetMember(exportName: string | undefined): TargetMember | undefined {
  return nodeOsPropertyTargetMembers().find((entry) => entry.exportName === exportName)?.member;
}

export function nodeOsCallTargetMembers(): readonly {
  readonly exportName: string;
  readonly signatureId: string;
  readonly providerReturnType: ProviderTypeExpression;
  readonly member: TargetMember;
}[] {
  return [
    osCall("arch", "node:os.arch()", stringProviderType, stringTargetType),
    osCall("availableParallelism", "node:os.availableParallelism()", numberProviderType, intTargetType),
    osCall("endianness", "node:os.endianness()", stringProviderType, stringTargetType),
    osCall("freemem", "node:os.freemem()", numberProviderType, longTargetType),
    osCall(nodeOsHomedirExportName, nodeOsHomedirSignatureId, stringProviderType, stringTargetType),
    osCall("hostname", "node:os.hostname()", stringProviderType, stringTargetType),
    osCall("loadavg", "node:os.loadavg()", { kind: "array", elementType: numberProviderType }, { kind: "array", element: doubleTargetType }),
    osCall("machine", "node:os.machine()", stringProviderType, stringTargetType),
    osCall(nodeOsPlatformExportName, nodeOsPlatformSignatureId, stringProviderType, stringTargetType),
    osCall("release", "node:os.release()", stringProviderType, stringTargetType),
    osCall("tmpdir", "node:os.tmpdir()", stringProviderType, stringTargetType),
    osCall("totalmem", "node:os.totalmem()", numberProviderType, longTargetType),
    osCall("type", "node:os.type()", stringProviderType, stringTargetType),
    osCall("uptime", "node:os.uptime()", numberProviderType, longTargetType),
    osCall("version", "node:os.version()", stringProviderType, stringTargetType),
  ];
}

export function nodeOsPropertyTargetMembers(): readonly {
  readonly exportName: string;
  readonly providerType: ProviderTypeExpression;
  readonly member: TargetMember;
}[] {
  return [
    osProperty("EOL", stringProviderType, stringTargetType),
    osProperty("devNull", stringProviderType, stringTargetType),
  ];
}

function osCall(
  exportName: string,
  signatureId: string,
  providerReturnType: ProviderTypeExpression,
  targetReturnType: TargetTypeRef,
): NodeOsCallTargetMember {
  return {
    exportName,
    signatureId,
    providerReturnType,
    member: targetMethod(
      `Tsonic.CSharp.Node.os.${exportName}()`,
      exportName,
      exportName,
      [],
      targetReturnType,
      {
        declaringType: osTargetType,
        static: true,
      },
    ),
  };
}

function osProperty(
  exportName: string,
  providerType: ProviderTypeExpression,
  targetType: TargetTypeRef,
): NodeOsPropertyTargetMember {
  return {
    exportName,
    providerType,
    member: targetProperty(`Tsonic.CSharp.Node.os.${exportName}`, exportName, exportName, targetType, {
      declaringType: osTargetType,
      static: true,
    }),
  };
}
