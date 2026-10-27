import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpOperationIssue } from "../../target-model/records/operations.js";
import { readCsharpSourceTypedLocationOperation } from "../../source/extension/typed-locations.js";
import { selectCsharpTargetCall } from "./members/selected-members.js";
import { csharpTargetCallRefusal } from "../callables/calls/call-refusals.js";

// A typed-location operand whose value comes from a refused target call cannot resolve its pointee; that call's own
// refusal is the root diagnostic (RULINGS 2026-10-23, option b). The operand is the call itself or an unwritten local
// initialized by it, followed through further such locals.
export function selectCsharpRefusedTypedLocationOperandCall(policy: CsharpPolicyContext, node: Node,
  sourceFile: SourceFile): CsharpOperationIssue | undefined {
  const source = readCsharpSourceTypedLocationOperation(policy.sourceFacts, node);
  if (source === undefined) return undefined;
  const operands = source.kind === "location-equal" ? [source.leftExpression, source.rightExpression]
    : "locationExpression" in source ? [source.locationExpression] : [];
  const visited = new Set<Node>();
  for (const operand of operands) {
    const root = refusedRoot(policy, operand, sourceFile, visited);
    if (root !== undefined) return root;
  }
  return undefined;
}

// A refused call whose own argument comes from another refused call reports that deeper call: its refusal is the root.
function refusedRoot(policy: CsharpPolicyContext, expression: Node, sourceFile: SourceFile,
  visited: Set<Node>): CsharpOperationIssue | undefined {
  const call = originatingCall(policy, expression);
  if (call === undefined || visited.has(call)) return undefined;
  visited.add(call);
  const refusal = csharpTargetCallRefusal(selectCsharpTargetCall(policy, call, sourceFile));
  if (refusal === undefined) return undefined;
  for (const argument of policy.ast.arguments(call)) {
    const deeper = argument === undefined ? undefined : refusedRoot(policy, argument, sourceFile, visited);
    if (deeper !== undefined) return deeper;
  }
  return Object.freeze({ node: call, code: refusal.code, message: refusal.message });
}

function originatingCall(policy: CsharpPolicyContext, expression: Node): Node | undefined {
  const visited = new Set<Node>();
  let current: Node | undefined = expression;
  while (current !== undefined && !visited.has(current)) {
    visited.add(current);
    if (policy.ast.is.IsCallExpression(current)) return current;
    if (!policy.ast.is.IsIdentifier(current)) return undefined;
    const declaration: Node | undefined = policy.navigation.referenceFor(current)?.declaration;
    if (declaration === undefined || !policy.ast.is.IsVariableDeclaration(declaration) ||
      policy.navigation.declarationUseSummary(declaration).bindingWritten) return undefined;
    current = policy.ast.as.AsVariableDeclaration(declaration)?.Initializer;
  }
  return undefined;
}
