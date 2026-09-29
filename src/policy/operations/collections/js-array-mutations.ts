import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import { selectCsharpTypedArrayMutation, type CsharpTypedArrayMutation, type CsharpTypedArrayUpdate } from "./typed-array-mutations.js";
import type {
  CsharpPolicyContext,
} from "../../model/context.js";
import {
  csharpSourceProfileDeclarationIdentity,
} from "../members/index.js";
import {
  getCsharpJsArrayMutationPolicy,
} from "../../types/index.js";
import {
  sourceOperatorFromKindName,
} from "../../../target-model/syntax/operators.js";

export type CsharpJsArrayMutationSelection =
  | CsharpTypedArrayMutation
  | CsharpTypedArrayUpdate
  | {
      readonly kind: "set-length";
      readonly receiver: Node;
      readonly value: Node;
      readonly targetMemberName: string;
    }
  | {
      readonly kind: "not-js-array-mutation";
    }
  | {
      readonly kind: "rejected";
      readonly reason: string;
    };

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
  const mutation = getCsharpJsArrayMutationPolicy(
    input.types.resolveType(source.receiver.type, sourceFile),
  );
  if (mutation === undefined) {
    return {
      kind: "rejected",
      reason:
        "The selected mutable JS Array length property has no closed C# mutation carrier.",
    };
  }
  return {
    kind: "set-length",
    receiver: source.receiver.expression,
    value,
    targetMemberName: mutation.setLengthMemberName,
  };
}
