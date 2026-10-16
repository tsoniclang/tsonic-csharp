import type { TargetNativeHandler } from "@tsonic/target-api/analysis";
import type { CsharpMemoryBindingSelection } from "./memory-bindings.js";
import type { CsharpSafetyOperation } from "./safety.js";
import type { CsharpJsStringConversionSelection } from "./explicit-js-string.js";
import type { CsharpNativePointerOperationSelection } from "./native-pointers.js";
import type { CsharpTypedLocationOperationSelection } from "./typed-locations.js";

export type CsharpNativeHandler = TargetNativeHandler<
  CsharpMemoryBindingSelection,
  CsharpSafetyOperation,
  Exclude<CsharpJsStringConversionSelection, { readonly kind: "not-js-string-conversion" }>,
  Exclude<CsharpNativePointerOperationSelection, { readonly kind: "not-native-pointer" }>,
  Exclude<CsharpTypedLocationOperationSelection, { readonly kind: "not-typed-location" }>
>;
