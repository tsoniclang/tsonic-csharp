import type { AstReader, Node } from "@tsonic/tsts";
import { type TargetUseSiteRef } from "@tsonic/target-api/analysis";
import type { CsharpExactLiteralSelection } from "../../target-model/conversions/exact-literals.js";
import type { CsharpConversionMode } from "../../target-model/conversions/selection.js";
import { type CsharpNativeCallableCreation } from "../../target-model/records/native-demand.js";
import type { CsharpOperationSelection, CsharpResolvedBinaryOperation } from "../../target-model/records/operator-selection.js";

import type { TargetTypeRef } from "../../target-model/types/model.js";

export interface CsharpNativeRepresentationChild {
  readonly site: TargetUseSiteRef;
  readonly expression?: Node;
  readonly target?: TargetTypeRef;
}

export interface CsharpNativeRepresentationInput {
  readonly ast: AstReader;
  readonly expression: Node;
  readonly target: TargetTypeRef;
  readonly mode: CsharpConversionMode;
  readonly source?: TargetTypeRef;
  readonly absent: boolean;
  readonly projection?: "present-payload";
  readonly literal: CsharpExactLiteralSelection | undefined;
  readonly callable: CsharpNativeCallableCreation | undefined;
  readonly constructionCarrier?: TargetTypeRef;
  readonly binary: CsharpOperationSelection<CsharpResolvedBinaryOperation> | undefined;
  readonly children: ReadonlyMap<string, CsharpNativeRepresentationChild>;
}
