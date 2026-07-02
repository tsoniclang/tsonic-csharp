import type {
  ProviderExportDeclaration,
} from "@tsonic/tsts";
import {
  nodePathCallTargetMembers,
} from "./calls.js";
import {
  nodePathParsedPathExportDeclaration,
} from "./parsed-path.js";
import {
  nodePathPathModuleExportDeclaration,
} from "./path-module.js";
import {
  nodePathPropertyTargetMembers,
} from "./properties.js";
import {
  nodePathModuleSpecifier,
} from "./identity.js";
import {
  nodejsDefaultModuleObjectExports,
} from "../module-defaults.js";

export function nodePathExports(): readonly ProviderExportDeclaration[] {
  const exports = [
    nodePathParsedPathExportDeclaration(),
    nodePathPathModuleExportDeclaration(),
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
  return [
    ...exports,
    ...nodejsDefaultModuleObjectExports(nodePathModuleSpecifier, exports),
  ];
}
