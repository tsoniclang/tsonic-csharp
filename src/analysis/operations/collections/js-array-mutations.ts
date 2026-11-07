import type { CsharpJsArrayMutationSelection } from "../../../target-model/records/storage/js-array-mutations.js";
import type { Node } from "@tsonic/tsts";
import { selectCsharpTypedArrayMutation } from "./typed-array-mutations.js";

import type { CsharpPolicyContext } from "../../../policy/model/context.js";

import { sourceOperatorFromKindName } from "../../../target-model/syntax/operators.js";

import { selectCsharpNativeArrayLengthWrite } from "../../../policy/operations/collections/js-array-mutations.js";
export function selectCsharpJsArrayMutation(
  input: CsharpPolicyContext,
  node: Node,
): CsharpJsArrayMutationSelection {
  if (input.ast.is.IsBinaryExpression(node)) {
    return selectCsharpTypedArrayMutation(input, node) ?? selectLengthAssignment(input, node);
  }
  if (input.ast.is.IsPrefixUnaryExpression(node) || input.ast.is.IsPostfixUnaryExpression(node)) {
    return selectCsharpTypedArrayMutation(input, node) ?? { kind: "not-js-array-mutation" };
  }
  return { kind: "not-js-array-mutation" };
}

function selectLengthAssignment(
  input: CsharpPolicyContext,
  node: Node,
): CsharpJsArrayMutationSelection {
  if (sourceOperatorFromKindName(input.ast.operatorKindName(node)) !== "=") {
    return { kind: "not-js-array-mutation" };
  }
  const binary = input.ast.as.AsBinaryExpression(node);
  const left = binary?.Left;
  const value = binary?.Right;
  if (
    left === undefined ||
    value === undefined ||
    !input.ast.is.IsPropertyAccessExpression(left)
  ) {
    return { kind: "not-js-array-mutation" };
  }
  // The JS meaning (facts.profile, D18): the selected member is the JS array's `length`.
  const source = input.facts.selections.memberAccess(left);
  const declarations = source?.selected.kind === "member" ? source.selected.declarations : [];
  const member = declarations.length !== 1 ? undefined : input.facts.profile.member(declarations[0]!);
  if (source === undefined || member === undefined || member.owner !== "array" || member.name !== "length") {
    return { kind: "not-js-array-mutation" };
  }
  const receiver = input.types.value(source.receiver);
  return selectCsharpNativeArrayLengthWrite(receiver.kind === "csharp-refused" ? undefined : receiver, source.receiver, value);
}
