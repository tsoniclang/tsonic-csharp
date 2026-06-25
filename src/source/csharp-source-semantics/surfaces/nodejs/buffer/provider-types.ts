import type {
  ProviderTypeExpression,
} from "@tsonic/tsts";

export const nodeBufferStringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
export const nodeBufferNumberProviderType = { kind: "number" } satisfies ProviderTypeExpression;
export const nodeBufferBoolProviderType = { kind: "boolean" } satisfies ProviderTypeExpression;
export const nodeBufferProviderType = { kind: "provider-ref", name: "Buffer" } satisfies ProviderTypeExpression;
