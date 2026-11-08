import type { CsharpJsArrayMutationSelection } from "../../../target-model/records/storage/js-array-mutations.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import { selectCsharpTypedArrayMutation } from "./typed-array-mutations.js";

import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import { csharpSourceProfileDeclarationIdentity } from "../../../policy/identities/selected-source.js";


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
  const publication = input.facts.values.operation(node);
  if (publication.kind === "refused" || publication.value.kind !== "assignment") {
    return { kind: "not-js-array-mutation" };
  }
  const left = publication.value.target;
  const value = publication.value.source.occurrence;
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
    input.facts.navigation,
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
  return selectCsharpNativeArrayLengthWrite(
    input.types.resolveNode(source.receiver.expression, sourceFile)?.sourceResult?.selectedType,
    source.receiver.expression, value);
}
