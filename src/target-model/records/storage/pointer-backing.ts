import type { Node } from "@tsonic/tsts";
import type { SourceMemoryLayout, SourcePointerBackingProducer } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../types/native-type-data.js";

export interface CsharpPointerBackingProducer {
  readonly source: SourcePointerBackingProducer;
  readonly pointeeType: TargetTypeRef;
}

export interface CsharpPointerBackingUse {
  readonly call: Node;
  readonly producers: readonly CsharpPointerBackingProducer[];
  readonly includesAbsence: boolean;
  readonly layout: SourceMemoryLayout;
}
