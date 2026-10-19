import type { Node } from "@tsonic/tsts";
import { Node_Expression } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../model/context.js";
import type { TargetTypeRef } from "../../types/index.js";
import { csharpReferenceIdentityCarrier } from "./reference-equality.js";

import type { CsharpAssignmentLocation } from "../../../target-model/operations/assignment-locations.js";

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
  const declaration = property
    ? input.semanticsFor(location).operations.propertyAccess(location)?.selectedDeclaration
    : input.semanticsFor(location).operations.elementAccess(location)?.selectedDeclaration;
  if (declaration !== undefined && input.ast.hasModifierKind(declaration, "static")) return "direct";
  const receiver = Node_Expression(input.ast, location);
  const type = receiver === undefined ? undefined : targetTypeFor(receiver);
  return type !== undefined && csharpReferenceIdentityCarrier(type, input) !== undefined
    ? "reference-receiver" : "unsupported";
}
