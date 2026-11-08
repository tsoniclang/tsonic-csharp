import type { TargetTypeRef } from "../types/native-type-data.js";
import type { CsharpAwaitCompletion } from "../types/await-completions.js";

export interface CsharpSourceCallResult {
  readonly nativeType: TargetTypeRef;
  readonly selectedType: TargetTypeRef;
  readonly completion?: CsharpAwaitCompletion;
}
