import type { CsharpPolicyContext } from "../model/context.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpExceptionTargetType, csharpTsValueTargetType, isCsharpClosedJsRuntimeCarrier } from "../../target-model/types/index.js";
import { isCsharpThrowableType } from "../types/resolution/target-hierarchy.js";
import { selectCsharpConversion } from "./selection/core.js";
import { csharpConversionIsApplicable } from "../../target-model/conversions/selection.js";

export function selectCsharpProgramErrorCarrier(
  input: Pick<CsharpPolicyContext, "projectTypes" | "providers" | "typeDefinitions" | "target">,
  source: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (source === undefined) return undefined;
  if (isCsharpThrowableType(input, source)) return source;
  const target = csharpExceptionTargetType();
  return csharpConversionIsApplicable(selectCsharpConversion(input, source, target, "implicit"), "implicit") ? target : undefined;
}

export function selectCsharpThrownOperandCarrier(
  input: Pick<CsharpPolicyContext, "projectTypes" | "providers" | "typeDefinitions" | "target" | "objectShapes">,
  source: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  const native = selectCsharpProgramErrorCarrier(input, source);
  if (native !== undefined || source === undefined) return native;
  if (source.kind === "source-primitive" && closedThrownPrimitives.has(source.name) ||
      isCsharpClosedJsRuntimeCarrier(source)) return csharpTsValueTargetType();
  if (input.projectTypes.catalog.definitionForTarget(source)?.kind === "class" &&
      input.objectShapes.resolveTarget(source) !== undefined) return csharpTsValueTargetType();
  return source.kind === "target-named" && closedThrownTypes.has(source.id) ? csharpTsValueTargetType() : undefined;
}

const closedThrownTypes = new Set([
  "System.Object",
  "System.String", "System.Boolean", "System.Byte", "System.SByte", "System.Int16", "System.UInt16", "System.Int32",
  "System.UInt32", "System.Int64", "System.UInt64", "System.Single", "System.Double", "System.Decimal",
  "Tsonic.CSharp.Runtime.TsValue", "Tsonic.CSharp.Runtime.TsObject", "Tsonic.CSharp.Runtime.TsArray", "Tsonic.CSharp.Runtime.TsFunction",
]);

const closedThrownPrimitives = new Set([
  "bool", "int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "float32", "float64", "decimal",
]);
