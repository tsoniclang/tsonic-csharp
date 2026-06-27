import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  isCsharpJsArrayCarrierTargetType,
} from "../../arrays.js";
import {
  isCsharpJsJsonValueTargetType,
} from "../../json.js";
import {
  isCsharpJsObjectCarrierTargetType,
} from "../../objects.js";
import type {
  CsharpJsSurfaceHost,
} from "../../source-library.js";
import {
  isNumericSourcePrimitive,
  isStringKeyedRecordDictionaryTargetType,
} from "../helpers.js";

export function isSupportedJsonValueTargetType(
  type: TargetTypeRef | undefined,
  host: CsharpJsSurfaceHost,
): boolean {
  return type !== undefined &&
    (
      host.isCsharpStringType(type) ||
      isNumericSourcePrimitive(type) ||
      (type.kind === "source-primitive" && type.name === "bool") ||
      isCsharpJsObjectCarrierTargetType(type) ||
      isCsharpJsArrayCarrierTargetType(type) ||
      isCsharpJsJsonValueTargetType(type)
    );
}

export function isSupportedObjectHelperSourceTargetType(
  type: TargetTypeRef | undefined,
  host: CsharpJsSurfaceHost,
): boolean {
  return type !== undefined &&
    (
      isCsharpJsObjectCarrierTargetType(type) ||
      isCsharpJsArrayCarrierTargetType(type) ||
      type.kind === "source-primitive" ||
      host.isCsharpStringType(type) ||
      isStringKeyedRecordDictionaryTargetType(type, host)
    );
}

export function targetTypeIsOpaqueAny(type: TargetTypeRef): boolean {
  return type.kind === "opaque" && type.id === "any";
}
