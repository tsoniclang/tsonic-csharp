import type { Node } from "@tsonic/tsts";
import type { CsharpIndexedRecordRead, CsharpIndexedRecordRecords } from "../../../target-model/records/indexed-records.js";

export function createCsharpIndexedRecordRecords(values: ReadonlyMap<Node, CsharpIndexedRecordRead>): CsharpIndexedRecordRecords {
  const records = new Map(values);
  return Object.freeze({ indexedRecordRead: Object.freeze({ get: (subject: Node) => records.get(subject) }) });
}
