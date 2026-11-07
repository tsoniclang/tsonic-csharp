import type { Node } from "@tsonic/tsts";
import type { TsonicMemoryLayoutRecord, TsonicPointerStorageProducer } from "@tsonic/source-core/facts";
import type { TargetTypeRef } from "../../types/model.js";

export interface CsharpPointerBackingProducer {
  readonly source: TsonicPointerStorageProducer;
  readonly pointeeType: TargetTypeRef;
}

export interface CsharpPointerBackingUse {
  readonly call: Node;
  readonly producers: readonly CsharpPointerBackingProducer[];
  readonly includesAbsence: boolean;
  readonly layout: TsonicMemoryLayoutRecord;
}
