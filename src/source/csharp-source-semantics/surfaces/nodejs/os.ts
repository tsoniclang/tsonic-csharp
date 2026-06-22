import type {
  ProviderExportDeclaration,
  ProviderTypeExpression,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpStringTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
  targetMethod,
} from "../js/source-library.js";

const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const stringTargetType = csharpStringTargetType();
const osTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.os", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "os"));

export const nodeOsModuleSpecifier = "node:os";
export const nodeOsHomedirExportName = "homedir";
export const nodeOsHomedirSignatureId = "node:os.homedir()";
export const nodeOsPlatformExportName = "platform";
export const nodeOsPlatformSignatureId = "node:os.platform()";

export function nodeOsExports(): readonly ProviderExportDeclaration[] {
  return [
    {
      id: "node:os.homedir",
      name: nodeOsHomedirExportName,
      kind: "function",
      signatures: [{
        id: nodeOsHomedirSignatureId,
        parameters: [],
        returnType: stringProviderType,
      }],
    },
    {
      id: "node:os.platform",
      name: nodeOsPlatformExportName,
      kind: "function",
      signatures: [{
        id: nodeOsPlatformSignatureId,
        parameters: [],
        returnType: stringProviderType,
      }],
    },
  ];
}

export function getNodeOsHomedirTargetMember(): TargetMember {
  return targetMethod(
    "Tsonic.CSharp.Node.os.homedir()",
    nodeOsHomedirExportName,
    nodeOsHomedirExportName,
    [],
    stringTargetType,
    {
      declaringType: osTargetType,
      static: true,
    },
  );
}

export function getNodeOsPlatformTargetMember(): TargetMember {
  return targetMethod(
    "Tsonic.CSharp.Node.os.platform()",
    nodeOsPlatformExportName,
    nodeOsPlatformExportName,
    [],
    stringTargetType,
    {
      declaringType: osTargetType,
      static: true,
    },
  );
}
