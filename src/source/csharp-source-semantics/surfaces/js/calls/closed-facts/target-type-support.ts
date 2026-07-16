import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
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
import {
  jsonTargetTypeHasClosedObjectShape,
} from "../../json-shape-serialization.js";

export function isSupportedJsonValueTargetType(
  subject: ExtensionFactSubject | undefined,
  type: TargetTypeRef | undefined,
  context: ExtensionObservationContext | undefined,
  host: CsharpJsSurfaceHost,
): boolean {
  return type !== undefined &&
    (
      host.isCsharpStringType(type) ||
      isNumericSourcePrimitive(type) ||
      (type.kind === "source-primitive" && type.name === "bool") ||
      isCsharpJsObjectCarrierTargetType(type) ||
      isCsharpJsJsonValueTargetType(type) ||
      isStringKeyedRecordDictionaryTargetType(type, host) ||
      (context !== undefined && jsonTargetTypeHasClosedObjectShape(subject, type, context, host))
    );
}

export function isSupportedObjectHelperSourceTargetType(
  type: TargetTypeRef | undefined,
  host: CsharpJsSurfaceHost,
): boolean {
  return type !== undefined &&
    (
      type.kind === "array" ||
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
