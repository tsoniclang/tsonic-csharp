import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpMemoryOutcome } from "../../policy/model/memory.js";
import type { CsharpOperationIssue } from "../../target-model/records/operations/operations.js";
import { represented, sourceOutcome } from "../../policy/types/source-type-flow/representation-results.js";
import { selectCsharpTargetCall } from "./members/selected-members.js";
import { csharpTargetCallRefusal } from "../callables/calls/call-refusals.js";

export function selectCsharpRefusedTypedLocationOperandCall(policy: CsharpPolicyContext, node: Node,
  sourceFile: SourceFile): CsharpMemoryOutcome<CsharpOperationIssue | undefined> {
  const selected = sourceOutcome(policy.facts.protocols.pointerOperation(node));
  if (selected.kind !== "represented") return selected;
  if (selected.value.kind === "none" || selected.value.value.family !== "typed-location") return represented(undefined);
  const source = selected.value.value;
  const operands = source.operation === "equal-pointer" ? [source.left, source.right]
    : "pointer" in source ? [source.pointer] : [];
  const visited = new Set<Node>();
  for (const operand of operands) {
    const root = refusedRoot(policy, operand.occurrence, sourceFile, visited);
    if (root.kind !== "represented" || root.value !== undefined) return root;
  }
  return represented(undefined);
}

function refusedRoot(policy: CsharpPolicyContext, expression: Node, sourceFile: SourceFile,
  visited: Set<Node>): CsharpMemoryOutcome<CsharpOperationIssue | undefined> {
  const call = originatingCall(policy, expression);
  if (call === undefined || visited.has(call)) return represented(undefined);
  visited.add(call);
  const source = sourceOutcome(policy.facts.applications.application(call));
  if (source.kind !== "represented") return source;
  const refusal = csharpTargetCallRefusal(selectCsharpTargetCall(policy, call, sourceFile));
  if (refusal === undefined) return represented(undefined);
  if (source.value.argumentDisposition !== "skip") for (const argument of source.value.sourceArguments) {
    const operand = sourceOutcome(argument.operand);
    if (operand.kind !== "represented") return operand;
    const deeper = refusedRoot(policy, operand.value.occurrence, sourceFile, visited);
    if (deeper.kind !== "represented" || deeper.value !== undefined) return deeper;
  }
  return represented(Object.freeze({ node: refusal.site ?? call, code: refusal.code, message: refusal.message,
    ...(refusal.source === undefined ? {} : { source: refusal.source }) }));
}

function originatingCall(policy: CsharpPolicyContext, expression: Node): Node | undefined {
  const visited = new Set<Node>();
  let current: Node | undefined = expression;
  while (current !== undefined && !visited.has(current)) {
    visited.add(current);
    if (policy.ast.is.IsCallExpression(current)) return current;
    if (!policy.ast.is.IsIdentifier(current)) return undefined;
    const declaration: Node | undefined = policy.facts.navigation.sourceReferenceFor(current)?.declaration;
    if (declaration === undefined || !policy.ast.is.IsVariableDeclaration(declaration) ||
      policy.facts.navigation.declarationUseSummary(declaration).bindingWritten) return undefined;
    current = policy.ast.as.AsVariableDeclaration(declaration)?.Initializer;
  }
  return undefined;
}
