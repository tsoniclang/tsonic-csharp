import { type TargetUseSiteRef } from "@tsonic/target-api/analysis";

import { type CsharpExpectedNativeUse } from "./native-demand.js";
import type { CsharpResolvedBinaryOperation } from "./operator-selection.js";

import type { TargetTypeRef } from "../types/model.js";

export type CsharpNativeRepresentationPending =
  | "source-unresolved" | "literal-unrequested" | "literal-rejected" | "callable-creation" | "callable-discarded"
  | "construction-unresolved" | "operation-unresolved" | "forwarding-child-unresolved";

export type CsharpNativeRepresentationSelection =
  | { readonly kind: "pending"; readonly reason: CsharpNativeRepresentationPending; readonly message?: string }
  | { readonly kind: "selected"; readonly representation: CsharpExpectedNativeUse["representation"];
      readonly carrier: TargetTypeRef; readonly children: readonly TargetUseSiteRef[];
      readonly literal?: CsharpExpectedNativeUse["literal"];
      readonly binary?: CsharpResolvedBinaryOperation;
      readonly construction?: CsharpExpectedNativeUse["construction"] };
