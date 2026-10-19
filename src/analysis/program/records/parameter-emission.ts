import type { Node } from "@tsonic/tsts";
import type { CsharpCallableParameterRecords, CsharpCallableParameterEmission } from "../../../target-model/records/parameter-emission.js";

export function createCsharpCallableParameterRecords(values: ReadonlyMap<Node, CsharpCallableParameterEmission>): CsharpCallableParameterRecords {
  return Object.freeze({ callableParameter: Object.freeze({ get: (subject: Node) => values.get(subject) }) });
}
