import type { TargetTypeRef } from "../types/model.js";
import type { CsharpAwaitCompletion } from "../types/await-completions.js";

export interface CsharpSourceCallResult {
  readonly effectiveType?: Exclude<import("@tsonic/target-api/source").SourceEffectiveTypeOutcome, { readonly kind: "refused" }>;
  readonly literalAdmission?: import("../records/objects/object-shapes.js").CsharpNativeSourceCarrierSelection;
  readonly nativeType: TargetTypeRef;
  readonly selectedType: TargetTypeRef;
  readonly completion?: CsharpAwaitCompletion;
}
