import type { CsharpJsStringConversionSelection } from "../../../target-model/records/explicit-js-string.js";
import type { CsharpMemoryBindingSelection } from "../../../target-model/records/memory-bindings.js";
import type { CsharpNativePointerOperationSelection } from "../../../target-model/records/native-pointers.js";
import type { CsharpNativeHandler } from "../../../target-model/records/native-handlers.js";
import { selectTargetNativeHandler } from "@tsonic/target-api/analysis";
import type { CsharpSafetyOperation } from "../../../target-model/records/safety.js";
import type { CsharpTypedLocationOperationSelection } from "../../../target-model/records/typed-locations.js";

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
