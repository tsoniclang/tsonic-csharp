import type { Node } from "@tsonic/tsts";
import type { SourceNodeReference } from "@tsonic/target-api/source";
import type { CsharpIdentifierEmission, CsharpSourceReferenceRecords } from "../../../../target-model/records/program/source-references.js";

export function createCsharpSourceReferenceRecords(input: {
  readonly identifiers: ReadonlyMap<Node, CsharpIdentifierEmission>;
  readonly modules: ReadonlyMap<Node, SourceNodeReference>;
  readonly references: ReadonlyMap<Node, { readonly value: SourceNodeReference | undefined; readonly declaration: SourceNodeReference | undefined }>;
}): CsharpSourceReferenceRecords {
  const identifiers = new WeakMap<Node, CsharpIdentifierEmission>();
  const modules = new WeakMap<Node, SourceNodeReference>();
  const references = new WeakMap<Node, { readonly value: SourceNodeReference | undefined; readonly declaration: SourceNodeReference | undefined }>();
  for (const [node, value] of input.identifiers) identifiers.set(node, Object.freeze(value));
  for (const [node, value] of input.modules) modules.set(node, value);
  for (const [node, value] of input.references) references.set(node, Object.freeze(value));
  return Object.freeze({ identifierEmission: Object.freeze({ get: (node: Node) => identifiers.get(node) }),
    sourceModuleReference: Object.freeze({ get: (node: Node) => modules.get(node) }),
    sourceReferenceIdentity: Object.freeze({ get: (node: Node) => references.get(node) }) });
}
