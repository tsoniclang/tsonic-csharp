import type {
  ProviderExportDeclaration,
} from "@tsonic/tsts";
import {
  nodeBufferClassExport,
} from "./class.js";
import {
  nodeBufferFunctionExports,
} from "./functions.js";

export function nodeBufferExports(): readonly ProviderExportDeclaration[] {
  return [
    nodeBufferClassExport(),
    ...nodeBufferFunctionExports(),
  ];
}
