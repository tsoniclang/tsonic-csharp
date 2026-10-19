import type { Node } from "@tsonic/tsts";
import type { CsharpMethodDeclarationEmission, CsharpMethodEmissionRecords } from "../../../target-model/records/method-emission.js";

export function createCsharpMethodEmissionRecords(values: ReadonlyMap<Node, CsharpMethodDeclarationEmission>): CsharpMethodEmissionRecords {
  const records = new Map(values);
  return Object.freeze({ methodDeclaration: Object.freeze({ get: (subject: Node) => records.get(subject) }) });
}
