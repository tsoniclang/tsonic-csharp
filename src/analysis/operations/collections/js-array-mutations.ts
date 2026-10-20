import type { CsharpJsArrayMutationSelection } from "../../../target-model/records/js-array-mutations.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import { selectCsharpTypedArrayMutation } from "./typed-array-mutations.js";

import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import { csharpSourceProfileDeclarationIdentity } from "../../../policy/identities/selected-source.js";

import { sourceOperatorFromKindName } from "../../../target-model/syntax/operators.js";

import { selectCsharpNativeArrayLengthWrite } from "../../../policy/operations/collections/js-array-mutations.js";
export function selectCsharpJsArrayMutation(
  input: CsharpPolicyContext,
  node: Node,
  sourceFile: SourceFile,
): CsharpJsArrayMutationSelection {
  if (input.ast.is.IsBinaryExpression(node)) {
    return selectCsharpTypedArrayMutation(input, node, sourceFile) ?? selectLengthAssignment(input, node, sourceFile);
  }
  if (input.ast.is.IsPrefixUnaryExpression(node) || input.ast.is.IsPostfixUnaryExpression(node)) {
    return selectCsharpTypedArrayMutation(input, node, sourceFile) ?? { kind: "not-js-array-mutation" };
  }
  return { kind: "not-js-array-mutation" };
}

function selectLengthAssignment(
  input: CsharpPolicyContext,
  node: Node,
  sourceFile: SourceFile,
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
  const source = input.semantics(sourceFile)
    .operations.propertyAccess(left);
  const identity = csharpSourceProfileDeclarationIdentity(
    input.ast,
    input.semantics(sourceFile),
    input.sourceFacts,
    source?.selectedDeclaration,
  );
  if (
    source === undefined ||
    identity?.owner !== "js" ||
    identity.kind !== "member" ||
    identity.declaringName !== "Array" ||
    identity.name !== "length"
  ) {
    return { kind: "not-js-array-mutation" };
  }
  return selectCsharpNativeArrayLengthWrite(input.types.resolveType(source.receiver.type, sourceFile), source.receiver.expression, value);
}
