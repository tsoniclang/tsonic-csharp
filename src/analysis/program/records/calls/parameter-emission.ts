import type { Node } from "@tsonic/tsts";
import type { CsharpCallableParameterRecords, CsharpCallableParameterEmission, CsharpLambdaParameterEntry } from "../../../../target-model/records/calls/parameter-emission.js";

export function createCsharpCallableParameterRecords(values: ReadonlyMap<Node, CsharpCallableParameterEmission>, entries: ReadonlyMap<Node, CsharpLambdaParameterEntry>): CsharpCallableParameterRecords {
  return Object.freeze({ callableParameter: Object.freeze({ get: (subject: Node) => values.get(subject) }),
    lambdaParameterEntry: Object.freeze({ get: (subject: Node) => entries.get(subject) }) });
}
