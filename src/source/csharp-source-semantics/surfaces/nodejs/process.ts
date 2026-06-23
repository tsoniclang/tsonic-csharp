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
import {
  targetProperty,
} from "../../target-types.js";

const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const stringTargetType = csharpStringTargetType();
const processTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.process", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "process"));

export const nodeProcessModuleSpecifier = "node:process";
export const nodeProcessCwdExportName = "cwd";
export const nodeProcessCwdSignatureId = "node:process.cwd()";
export const nodeProcessPlatformExportName = "platform";

export function nodeProcessExports(): readonly ProviderExportDeclaration[] {
  return [
    {
      id: "node:process.cwd",
      name: nodeProcessCwdExportName,
      kind: "function",
      signatures: [{
        id: nodeProcessCwdSignatureId,
        parameters: [],
        returnType: stringProviderType,
      }],
    },
    {
      id: "node:process.platform",
      name: nodeProcessPlatformExportName,
      kind: "value",
      type: stringProviderType,
    },
  ];
}

export function getNodeProcessCwdTargetMember(): TargetMember {
  return targetMethod(
    "Tsonic.CSharp.Node.process.cwd()",
    nodeProcessCwdExportName,
    nodeProcessCwdExportName,
    [],
    stringTargetType,
    {
      declaringType: processTargetType,
      static: true,
    },
  );
}

export function getNodeProcessPlatformTargetMember(): TargetMember {
  return targetProperty(
    "Tsonic.CSharp.Node.process.platform",
    nodeProcessPlatformExportName,
    nodeProcessPlatformExportName,
    stringTargetType,
    {
      declaringType: processTargetType,
      static: true,
    },
  );
}
