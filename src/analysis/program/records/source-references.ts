import type { Node } from "@tsonic/tsts";
import type { SourceProjectReference } from "@tsonic/target-api/source";
import type { CsharpIdentifierEmission, CsharpSourceReferenceRecords } from "../../../target-model/records/source-references.js";

export function createCsharpSourceReferenceRecords(input: {
  readonly identifiers: ReadonlyMap<Node, CsharpIdentifierEmission>;
  readonly modules: ReadonlyMap<Node, SourceProjectReference>;
  readonly references: ReadonlyMap<Node, { readonly value: SourceProjectReference | undefined; readonly declaration: SourceProjectReference | undefined }>;
}): CsharpSourceReferenceRecords {
  const identifiers = new WeakMap<Node, CsharpIdentifierEmission>();
  const modules = new WeakMap<Node, SourceProjectReference>();
  const references = new WeakMap<Node, { readonly value: SourceProjectReference | undefined; readonly declaration: SourceProjectReference | undefined }>();
  for (const [node, value] of input.identifiers) identifiers.set(node, Object.freeze(value));
  for (const [node, value] of input.modules) modules.set(node, value);
  for (const [node, value] of input.references) references.set(node, Object.freeze(value));
  return Object.freeze({ identifierEmission: Object.freeze({ get: (node: Node) => identifiers.get(node) }),
    sourceModuleReference: Object.freeze({ get: (node: Node) => modules.get(node) }),
    sourceReferenceIdentity: Object.freeze({ get: (node: Node) => references.get(node) }) });
}
