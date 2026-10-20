import type { Node } from "@tsonic/tsts";
import type { CsharpTypedLocationStorage } from "../../../target-model/records/typed-location-storage.js";
import type { CsharpTypedLocationEmission, CsharpTypedStorageEmission, CsharpTypedLocationEmissionRecords } from "../../../target-model/records/typed-location-emission.js";

export function createCsharpTypedLocationEmissionRecords(locations: ReadonlyMap<Node, CsharpTypedLocationEmission>,
  storage: ReadonlyMap<CsharpTypedLocationStorage, CsharpTypedStorageEmission>): CsharpTypedLocationEmissionRecords {
  const operations = new WeakMap<Node, CsharpTypedLocationEmission>();
  const storage_ = new WeakMap<CsharpTypedLocationStorage, CsharpTypedStorageEmission>();
  for (const [node, value] of locations) operations.set(node, Object.freeze(value));
  for (const [subject, value] of storage) storage_.set(subject, Object.freeze(value));
  return Object.freeze({ typedLocationEmission: Object.freeze({ get: (node: Node) => operations.get(node) }),
    typedStorageEmission: Object.freeze({ get: (subject: CsharpTypedLocationStorage) => storage_.get(subject) }) });
}
