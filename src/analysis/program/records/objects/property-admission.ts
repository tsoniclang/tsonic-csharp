import type { Node } from "@tsonic/tsts";
import type { CsharpPropertyAdmissionRecords, CsharpAdmittedPropertyClassification, CsharpSourceMemberEmission, CsharpUnionPropertyProjection } from "../../../../target-model/records/objects/property-admission.js";

export function createCsharpPropertyAdmissionRecords(input: {
  readonly properties: ReadonlyMap<Node, CsharpAdmittedPropertyClassification>;
  readonly members: ReadonlyMap<Node, CsharpSourceMemberEmission>;
  readonly unions: ReadonlyMap<Node, CsharpUnionPropertyProjection>;
  readonly indexers: ReadonlyMap<Node, string>;
}): CsharpPropertyAdmissionRecords {
  const properties = new WeakMap<Node, CsharpAdmittedPropertyClassification>();
  const members = new WeakMap<Node, CsharpSourceMemberEmission>();
  const unions = new WeakMap<Node, CsharpUnionPropertyProjection>();
  const indexers = new WeakMap<Node, string>();
  for (const [node, value] of input.properties) properties.set(node, Object.freeze(value));
  for (const [node, value] of input.members) members.set(node, Object.freeze(value));
  for (const [node, value] of input.unions) unions.set(node, Object.freeze(value));
  for (const [node, value] of input.indexers) indexers.set(node, value);
  return Object.freeze({ selectedProperty: Object.freeze({ get: (node: Node) => properties.get(node) }),
    sourceMemberEmission: Object.freeze({ get: (node: Node) => members.get(node) }),
    unionPropertyProjection: Object.freeze({ get: (node: Node) => unions.get(node) }),
    sourceNameIndexer: Object.freeze({ get: (node: Node) => indexers.get(node) }) });
}
