import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpObjectLiteralEmission, CsharpObjectLiteralMemberEmission, CsharpObjectLiteralRecords } from "../../../target-model/records/object-literals.js";

export function createCsharpObjectLiteralRecords(
  entries: readonly { readonly shape: CsharpObjectShapeFact; readonly node: Node; readonly value: CsharpObjectLiteralEmission }[],
): CsharpObjectLiteralRecords {
  const literals = new WeakMap<CsharpObjectShapeFact, WeakMap<Node, CsharpObjectLiteralEmission>>();
  const members = new WeakMap<CsharpObjectShapeFact, WeakMap<Node, CsharpObjectLiteralMemberEmission>>();
  const receiverBound: { readonly property: Node; readonly receiver: TargetTypeRef }[] = [];
  for (const entry of entries) {
    let shapes = literals.get(entry.shape);
    if (shapes === undefined) { shapes = new WeakMap(); literals.set(entry.shape, shapes); }
    let properties = members.get(entry.shape);
    if (properties === undefined) { properties = new WeakMap(); members.set(entry.shape, properties); }
    if (shapes.has(entry.node)) failTargetAnalysisInvariant("tsonic-csharp", "An exact source object and selected native shape have one literal producer.", entry.node);
    shapes.set(entry.node, entry.value);
    for (const member of entry.value.members) {
      if (properties.has(member.property)) failTargetAnalysisInvariant("tsonic-csharp", "A native object initializer has one source property owner.", member.property);
      properties.set(member.property, member);
      if ((member.kind === "method" || member.kind === "accessor") && member.callable.receiver !== undefined)
        receiverBound.push(Object.freeze({ property: member.property, receiver: member.callable.receiver }));
    }
  }
  return Object.freeze({
    objectLiteral: Object.freeze({ get: (shape: CsharpObjectShapeFact, node: Node) => literals.get(shape)?.get(node) }),
    objectLiteralMember: Object.freeze({ get: (shape: CsharpObjectShapeFact, node: Node) => members.get(shape)?.get(node) }),
    receiverBoundCallables: Object.freeze(receiverBound),
  });
}
