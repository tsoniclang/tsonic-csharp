import type { CsharpNativeMemoryLayout } from "../operations/native-memory.js";
import type { TargetTypeRef } from "../types/model.js";
import type { Node } from "@tsonic/tsts";

export type CsharpRawLocationSelection =
  | { readonly kind: "rejected"; readonly operation: "raw-location"; readonly reason: string }
  | { readonly kind: "raw-location"; readonly method: "ToRaw" | "Reinterpret";
      readonly expression: Node; readonly inputType: TargetTypeRef; readonly layout: CsharpNativeMemoryLayout };
