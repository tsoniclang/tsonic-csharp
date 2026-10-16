import type { CsharpJsStringConversionSelection } from "../../../target-model/records/explicit-js-string.js";
import type { CsharpMemoryBindingSelection } from "../../../target-model/records/memory-bindings.js";
import type { CsharpNativePointerOperationSelection } from "../../../target-model/records/native-pointers.js";
import type { CsharpNativeHandler } from "../../../target-model/records/operations.js";
import type { CsharpSafetyOperation } from "../../../target-model/records/safety.js";
import type { CsharpTypedLocationOperationSelection } from "../../../target-model/records/typed-locations.js";

export function selectCsharpNativeHandler(
  memoryBinding: CsharpMemoryBindingSelection | undefined,
  safety: CsharpSafetyOperation | undefined,
  jsStringConversion: CsharpJsStringConversionSelection | undefined,
  nativePointer: CsharpNativePointerOperationSelection | undefined,
  typedLocation: CsharpTypedLocationOperationSelection | undefined,
): CsharpNativeHandler | undefined {
  if (memoryBinding !== undefined) return "memory-binding";
  if (safety !== undefined) return "explicit-safety";
  if (jsStringConversion !== undefined && jsStringConversion.kind !== "not-js-string-conversion") return "js-string-conversion";
  if (nativePointer !== undefined && nativePointer.kind !== "not-native-pointer") return "native-pointer";
  return typedLocation !== undefined && typedLocation.kind !== "not-typed-location" ? "typed-location" : undefined;
}
