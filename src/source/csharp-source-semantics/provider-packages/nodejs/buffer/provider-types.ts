import type {
  ProviderTypeExpression,
} from "@tsonic/tsts";
import {
  nodeBufferExportName,
  nodeBufferModuleSpecifier,
} from "./identities.js";

export const nodeBufferStringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
export const nodeBufferNumberProviderType = { kind: "number" } satisfies ProviderTypeExpression;
export const nodeBufferBoolProviderType = { kind: "boolean" } satisfies ProviderTypeExpression;
export const nodeBufferProviderType = { kind: "provider-ref", moduleSpecifier: nodeBufferModuleSpecifier, exportName: nodeBufferExportName } satisfies ProviderTypeExpression;
