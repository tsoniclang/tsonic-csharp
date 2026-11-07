import type { Node } from "@tsonic/tsts";
import { Node_Expression } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { TargetTypeRef } from "../../policy/types/index.js";
import { csharpReferenceIdentityCarrier } from "../../policy/operations/operators/reference-equality.js";

import type { CsharpAssignmentLocation } from "../../target-model/operations/assignment-locations.js";

export function selectCsharpAssignmentLocation(
  input: CsharpPolicyContext,
  node: Node,
  targetTypeFor: (node: Node) => TargetTypeRef | undefined,
): CsharpAssignmentLocation {
  let location = node;
  while (input.ast.is.IsParenthesizedExpression(location)) {
    const nested = input.ast.as.AsParenthesizedExpression(location)?.Expression;
    if (nested === undefined) return "unsupported";
    location = nested;
  }
  if (input.ast.is.IsIdentifier(location)) return "direct";
  const property = input.ast.is.IsPropertyAccessExpression(location);
  const element = input.ast.is.IsElementAccessExpression(location);
  if (!property && !element) return "unsupported";
  // The Host member or element selection names the declaration written; a static member is written directly.
  const declarations = property ? memberDeclarations(input.facts.selections.memberAccess(location)?.selected)
    : memberDeclarations(input.facts.values.elementAccess(location).selected);
  if (declarations.some(declaration => input.ast.hasModifierKind(declaration, "static"))) return "direct";
  const receiver = Node_Expression(input.ast, location);
  const type = receiver === undefined ? undefined : targetTypeFor(receiver);
  return type !== undefined && csharpReferenceIdentityCarrier(type, input) !== undefined
    ? "reference-receiver" : "unsupported";
}

function memberDeclarations(selected: { readonly kind: string; readonly declarations?: readonly Node[]; readonly declaration?: Node } | undefined): readonly Node[] {
  if (selected === undefined) return [];
  if (selected.declarations !== undefined) return selected.declarations;
  return selected.declaration === undefined ? [] : [selected.declaration];
}
