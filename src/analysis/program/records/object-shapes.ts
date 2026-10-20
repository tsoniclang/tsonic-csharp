import type { CsharpObjectShapeClassifications } from "../../../target-model/records/object-shapes.js";
import type { CsharpObjectShapeRecords } from "../../../target-model/records/object-shapes.js";

export function createCsharpObjectShapeRecords(sealed: Pick<CsharpObjectShapeClassifications, "resolveNode" | "resolveTarget">): CsharpObjectShapeRecords {
  return Object.freeze({ nodeObjectShape: Object.freeze({ get: sealed.resolveNode }), targetObjectShape: Object.freeze({ get: sealed.resolveTarget }) });
}
