import type { TargetTypeRef, CsharpOptionalTypeProjection, CsharpOptionalStorageLayout } from "../../../target-model/types/native-type-data.js";
import { csharpOptionalProjectedType } from "../../../target-model/types/projections.js";
import { csharpTargetNamedType } from "../../../target-model/types/factories.js";
import { csharpQualifiedTypeRenderShape } from "../../../target-model/types/render-shapes.js";
import { isCsharpValueTypeTargetType } from "../../../target-model/types/identity.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { csharpConstraintsRequireReference } from "../../../target-model/types/generic-constraints.js";
import { isCsharpAbsenceTargetType, isCsharpJsValueTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";

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
  const arity = selected.arguments.length === 0 ? "" : "`" + selected.arguments.length;
  return csharpTargetNamedType(`Tsonic.CSharp.Runtime.${selected.name}${arity}`, selected.arguments,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", selected.name),
    { allowsRefLikeTypeArguments: selected.arguments.map(() => false), valueType: true });
}

export function selectCsharpOptionalStorageOperation(element: TargetTypeRef): {
  readonly name: string; readonly arguments: readonly TargetTypeRef[];
} {
  let name: string;
  let arguments_: readonly TargetTypeRef[];
  if (isCsharpAbsenceTargetType(element)) {
    name = "AbsentOptionalStorage";
    arguments_ = [];
  } else if (isCsharpJsValueTargetType(element)) {
    name = "JsValueOptionalStorage";
    arguments_ = [];
  } else {
    const nullable = getCsharpNullableElementTargetType(element);
    const valueType = isCsharpValueTypeTargetType(element);
    name = valueType
      ? nullable === undefined ? "ValueOptionalStorage" : "NullableValueOptionalStorage"
      : "ReferenceOptionalStorage";
    arguments_ = [nullable !== undefined && valueType ? nullable : element];
  }
  return Object.freeze({ name, arguments: Object.freeze(arguments_) });
}

export function selectCsharpOptionalStorage(payload: TargetTypeRef): CsharpOptionalStorageLayout {
  const carrier = resolveCsharpOptionalStorage({ kind: "optional", part: "storage", arguments: [payload] }, payload);
  const operations = resolveCsharpOptionalStorage({ kind: "optional", part: "operations", arguments: [payload] }, payload);
  const requirements = [carrier, operations].flatMap(type => type.kind === "type-parameter" && type.csharpConstraints?.kind === "resolved"
    ? [Object.freeze({ ...type, csharpConstraints: type.csharpConstraints })] : []);
  return Object.freeze({ payload, carrier, operations, requirements: Object.freeze(requirements) });
}
