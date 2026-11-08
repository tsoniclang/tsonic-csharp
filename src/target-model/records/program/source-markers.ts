import type { Node } from "@tsonic/tsts";
import type { SourceTypeEvidence } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../types/native-type-data.js";

export interface CsharpSourceDefaultValue {
  readonly typeNode: Node;
  readonly evidence: SourceTypeEvidence;
  readonly carrier: TargetTypeRef;
}

export interface CsharpSourceField {
  readonly sourceName: string;
  readonly typeNode: Node;
  readonly evidence: SourceTypeEvidence;
  readonly carrier: TargetTypeRef;
  readonly readonly: boolean;
}

export interface CsharpSourceStruct {
  readonly valueType: boolean;
  readonly fields: readonly CsharpSourceField[];
}
