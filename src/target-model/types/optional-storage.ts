import type { TargetTypeRef } from "./model.js";
import type { CsharpOptionalTypeProjection } from "./projections.js";
import { csharpProjectedType } from "./projections.js";
import { csharpTargetNamedType } from "./factories.js";
import { csharpQualifiedTypeRenderShape } from "./render-shapes.js";
import { isCsharpValueTypeTargetType } from "./identity.js";
import { getCsharpNullableElementTargetType } from "./nullable.js";
import {
  combineCsharpTargetUnionMembers,
  csharpAbsenceTargetType,
  isCsharpAbsenceTargetType,
  isCsharpJsValueTargetType,
} from "./runtime-carriers.js";

export function resolveCsharpOptionalStorage(
  contract: CsharpOptionalTypeProjection,
  element: TargetTypeRef,
): TargetTypeRef | undefined {
  if (element.kind === "type-parameter") {
    return csharpProjectedType({ ...contract, arguments: [element] });
  }
  const storage = combineCsharpTargetUnionMembers([element, csharpAbsenceTargetType()]);
  if (storage === undefined || contract.part === "storage") return storage;
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
  const arity = arguments_.length === 0 ? "" : "`" + arguments_.length;
  return csharpTargetNamedType(
    `Tsonic.CSharp.Runtime.${name}${arity}`,
    arguments_,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", name),
    { valueType: true },
  );
}
