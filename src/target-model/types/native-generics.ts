import type { CsharpNativeGenericTypeDefinition, CsharpOptionalStorageDefinitions, TargetTypeRef } from "./native-type-data.js";

export const csharpOptionalStorageDefinitionNames = Object.freeze([
  "contract", "value", "nullableValue", "reference", "absence", "jsValue",
] as const);

export const csharpOptionalStorageDefinitionArities: Readonly<Record<keyof CsharpOptionalStorageDefinitions, number>> = Object.freeze({
  contract: 2, value: 1, nullableValue: 1, reference: 1, absence: 0, jsValue: 0,
});

export function applyCsharpNativeGenericType(definition: CsharpNativeGenericTypeDefinition,
  arguments_: readonly TargetTypeRef[]): Extract<TargetTypeRef, { readonly kind: "target-named" }> {
  const parameters = definition.carrier.typeArguments ?? [];
  if (arguments_.length !== definition.parameters.length || parameters.length !== definition.parameters.length ||
    new Set(definition.parameters).size !== definition.parameters.length ||
    parameters.some((parameter, index) => parameter.kind !== "type-parameter" || parameter.identity !== definition.parameters[index])) {
    throw new TypeError("A Native generic application requires its acquired template and exact ordered argument vector.");
  }
  return Object.freeze({ ...definition.carrier, typeArguments: Object.freeze([...arguments_]) });
}
