import type { Node } from "@tsonic/tsts";
import type { CsharpConstructorArgumentEmission, CsharpConstructorEmissionRecords, CsharpConstructorEntryEmission } from "../../../../target-model/records/objects/constructor-emission.js";

export function createCsharpConstructorEmissionRecords(
  entries: ReadonlyMap<Node, CsharpConstructorEntryEmission>,
  arguments_: ReadonlyMap<Node, CsharpConstructorArgumentEmission>,
): CsharpConstructorEmissionRecords {
  return Object.freeze({
    constructorEntry: Object.freeze({ get: (subject: Node) => entries.get(subject) }),
    constructorArgument: Object.freeze({ get: (subject: Node) => arguments_.get(subject) }),
  });
}
