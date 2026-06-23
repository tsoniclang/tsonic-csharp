import type {
  ProviderExportDeclaration,
  ProviderTypeExpression,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
  targetMethod,
  targetParameter,
} from "../js/source-library.js";

const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const boolProviderType = { kind: "boolean" } satisfies ProviderTypeExpression;
const stringTargetType = csharpStringTargetType();
const boolTargetType = csharpSourcePrimitiveTargetType("bool");
const fsTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.fs", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "fs"));

export const nodeFsModuleSpecifier = "node:fs";
export const nodeFsExistsSyncExportName = "existsSync";
export const nodeFsExistsSyncSignatureId = "node:fs.existsSync(System.String)";

export function nodeFsExports(): readonly ProviderExportDeclaration[] {
  return [
    {
      id: "node:fs.existsSync",
      name: nodeFsExistsSyncExportName,
      kind: "function",
      signatures: [{
        id: nodeFsExistsSyncSignatureId,
        parameters: [{ name: "path", type: stringProviderType }],
        returnType: boolProviderType,
      }],
    },
  ];
}

export function getNodeFsExistsSyncTargetMember(): TargetMember {
  return targetMethod(
    "Tsonic.CSharp.Node.fs.existsSync(System.String)",
    nodeFsExistsSyncExportName,
    nodeFsExistsSyncExportName,
    [targetParameter("path", stringTargetType)],
    boolTargetType,
    {
      declaringType: fsTargetType,
      static: true,
    },
  );
}
