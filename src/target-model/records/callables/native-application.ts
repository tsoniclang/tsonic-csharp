import type { SourceApplicationIdentity } from "@tsonic/target-api/source";
import type { CsharpNativeCallableApplication } from "../../conversions/selection.js";
import type { TargetTypeRef } from "../../types/model.js";

export interface CsharpSourceCallableApplication extends CsharpNativeCallableApplication {
  readonly identity: SourceApplicationIdentity;
  readonly carrier: TargetTypeRef;
  readonly owner: TargetTypeRef;
}
