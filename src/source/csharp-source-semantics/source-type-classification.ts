import type {
  ExtensionObservationContext,
  Type,
} from "@tsonic/tsts";
import {
  isSourceLibraryType,
} from "./source-library.js";

export type SourceStandardLibraryTypeClassification =
  | {
      readonly kind: "array";
      readonly readonly: false;
    }
  | {
      readonly kind: "array";
      readonly readonly: true;
    }
  | { readonly kind: "promise" }
  | { readonly kind: "record" };

export function classifySourceStandardLibraryType(
  type: Type,
  context: ExtensionObservationContext,
): SourceStandardLibraryTypeClassification | undefined {
  if (isSourceLibraryType(type, context, "Array")) {
    return { kind: "array", readonly: false };
  }
  if (isSourceLibraryType(type, context, "ReadonlyArray")) {
    return { kind: "array", readonly: true };
  }
  if (isSourceLibraryType(type, context, "Promise")) {
    return { kind: "promise" };
  }
  if (isSourceLibraryType(type, context, "Record")) {
    return { kind: "record" };
  }
  return undefined;
}

export function isSourceStandardLibraryArrayLikeType(
  type: Type,
  context: ExtensionObservationContext,
): boolean {
  return classifySourceStandardLibraryType(type, context)?.kind === "array";
}

export function isSourceStandardLibraryPromiseType(
  type: Type,
  context: ExtensionObservationContext,
): boolean {
  return classifySourceStandardLibraryType(type, context)?.kind === "promise";
}

export function isSourceStandardLibraryRecordType(
  type: Type,
  context: ExtensionObservationContext,
): boolean {
  return classifySourceStandardLibraryType(type, context)?.kind === "record";
}

export function sourceStandardLibraryTypeIsObjectShapeExcluded(
  type: Type,
  context: ExtensionObservationContext,
): boolean {
  return isSourceStandardLibraryArrayLikeType(type, context);
}
