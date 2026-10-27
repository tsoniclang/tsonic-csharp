import type { CsharpJsStringConversionSelection } from "../../../target-model/records/operations/explicit-js-string.js";
import type { CsharpMemoryBindingSelection } from "../../../target-model/records/storage/memory-bindings.js";
import type { CsharpNativePointerOperationSelection } from "../../../target-model/records/native/native-pointers.js";
import type { CsharpNativeHandler } from "../../../target-model/records/native/native-handlers.js";
import { selectTargetNativeHandler } from "@tsonic/target-api/analysis";
import type { CsharpSafetyOperation } from "../../../target-model/records/storage/safety.js";
import type { CsharpTypedLocationOperationSelection } from "../../../target-model/records/storage/typed-locations.js";

export function selectCsharpNativeHandler(
  memoryBinding: CsharpMemoryBindingSelection | undefined,
  safety: CsharpSafetyOperation | undefined,
  jsStringConversion: CsharpJsStringConversionSelection | undefined,
  nativePointer: CsharpNativePointerOperationSelection | undefined,
  typedLocation: CsharpTypedLocationOperationSelection | undefined,
): CsharpNativeHandler | undefined {
  return selectTargetNativeHandler(memoryBinding, safety,
    jsStringConversion?.kind === "not-js-string-conversion" ? undefined : jsStringConversion,
    nativePointer?.kind === "not-native-pointer" ? undefined : nativePointer,
    typedLocation?.kind === "not-typed-location" ? undefined : typedLocation);
}
