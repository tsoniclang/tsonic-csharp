import type { TargetTypeRef, CsharpOptionalTypeProjection, CsharpOptionalStorageDefinitions, CsharpOptionalStorageLayout } from "./native-type-data.js";
import { csharpOptionalProjectedType } from "./projections.js";
import { applyCsharpNativeGenericType } from "./native-generics.js";
import { isCsharpValueTypeTargetType } from "./identity.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "./carriers/nullable.js";
import { csharpConstraintsRequireReference } from "./generic-constraints.js";
import { isCsharpAbsenceTargetType, isCsharpJsValueTargetType } from "./carriers/runtime-carriers.js";

export function resolveCsharpOptionalStorage(
  contract: CsharpOptionalTypeProjection,
  element: TargetTypeRef,
): TargetTypeRef {
  if (element.kind === "type-parameter" && !isCsharpValueTypeTargetType(element) && !(element.csharpConstraints?.kind === "resolved" &&
    csharpConstraintsRequireReference(element.csharpConstraints.constraints))) {
    return csharpOptionalProjectedType({ ...contract, arguments: [element] });
  }
  const storage = csharpNullableTargetType(element);
  if (contract.part === "storage") return storage;
  const selected = selectCsharpOptionalStorageOperation(element);
  return applyCsharpNativeGenericType(contract.definitions[selected.definition], selected.arguments);
}

export function selectCsharpOptionalStorageOperation(element: TargetTypeRef): {
  readonly definition: Exclude<keyof CsharpOptionalStorageDefinitions, "contract">; readonly arguments: readonly TargetTypeRef[];
} {
  let definition: Exclude<keyof CsharpOptionalStorageDefinitions, "contract">;
  let arguments_: readonly TargetTypeRef[];
  if (isCsharpAbsenceTargetType(element)) {
    definition = "absence";
    arguments_ = [];
  } else if (isCsharpJsValueTargetType(element)) {
    definition = "jsValue";
    arguments_ = [];
  } else {
    const nullable = getCsharpNullableElementTargetType(element);
    const valueType = isCsharpValueTypeTargetType(element);
    definition = valueType
      ? nullable === undefined ? "value" : "nullableValue"
      : "reference";
    arguments_ = [nullable !== undefined && valueType ? nullable : element];
  }
  return Object.freeze({ definition, arguments: Object.freeze(arguments_) });
}

export function selectCsharpOptionalStorage(payload: TargetTypeRef, definitions: CsharpOptionalStorageDefinitions): CsharpOptionalStorageLayout {
  const carrier = resolveCsharpOptionalStorage({ kind: "optional", part: "storage", arguments: [payload], definitions }, payload);
  const operations = resolveCsharpOptionalStorage({ kind: "optional", part: "operations", arguments: [payload], definitions }, payload);
  const requirements = [carrier, operations].flatMap(type => type.kind === "type-parameter" && type.csharpConstraints?.kind === "resolved"
    ? [Object.freeze({ ...type, csharpConstraints: type.csharpConstraints })] : []);
  return Object.freeze({ payload, carrier, operations, requirements: Object.freeze(requirements) });
}
