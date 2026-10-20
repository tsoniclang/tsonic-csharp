import type { Node } from "@tsonic/tsts";
import type { CsharpNumericRepresentations } from "../../../target-model/records/numeric.js";

export function createCsharpNumericRepresentationRecords(expressions: readonly Node[]): CsharpNumericRepresentations {
  const selected = new WeakSet(expressions);
  return Object.freeze({ int32Remainder: Object.freeze({ get: (expression: Node) => selected.has(expression) }) });
}
