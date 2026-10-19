import type { Node } from "@tsonic/tsts";
import type { CsharpCallableDeclarationEmission, CsharpCallableDeclarationRecords } from "../../../target-model/records/callable-emission.js";

export function createCsharpCallableDeclarationRecords(values: ReadonlyMap<Node, CsharpCallableDeclarationEmission>): CsharpCallableDeclarationRecords {
  const records = new Map(values);
  return Object.freeze({ callableDeclaration: Object.freeze({ get: (subject: Node) => records.get(subject) }) });
}
