import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpPolicyContext,
} from "../../context.js";
import {
  csharpSourceProfileDeclarationIdentity,
} from "../../members/index.js";
import {
  getCsharpJsArrayMutationPolicy,
} from "../../types/index.js";
import {
  sourceOperatorFromKindName,
} from "../syntax/syntax.js";

export type CsharpJsArrayMutationSelection =
  | {
      readonly kind: "delete-element";
      readonly receiver: Node;
      readonly index: Node;
      readonly targetMemberName: string;
    }
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
  if (input.ast.is.IsDeleteExpression(node)) {
    return selectDelete(input, node, sourceFile);
  }
  if (input.ast.is.IsBinaryExpression(node)) {
    return selectLengthAssignment(input, node, sourceFile);
  }
  return { kind: "not-js-array-mutation" };
}

function selectDelete(
  input: CsharpPolicyContext,
  node: Node,
  sourceFile: SourceFile,
): CsharpJsArrayMutationSelection {
  const operand = input.ast.as.AsDeleteExpression(node)?.Expression;
  if (operand === undefined || !input.ast.is.IsElementAccessExpression(operand)) {
    return {
      kind: "rejected",
      reason:
        "C# delete requires an exact selected JS Array element access.",
    };
  }
  const source = input.semantics(sourceFile).operations.elementAccess(
    operand,
  );
  const identity = csharpSourceProfileDeclarationIdentity(
    input.ast,
    source?.selectedDeclaration,
  );
  if (
    source === undefined ||
    identity?.owner !== "js" ||
    identity.kind !== "indexer" ||
    identity.declaringName !== "Array"
  ) {
    return {
      kind: "rejected",
      reason:
        "C# delete is supported only for the exact mutable JS Array index signature selected by the checker.",
    };
  }
  const mutation = getCsharpJsArrayMutationPolicy(
    input.types.resolveType(source.receiver.type, sourceFile),
  );
  if (mutation === undefined) {
    return {
      kind: "rejected",
      reason:
        "The selected JS Array element has no closed C# mutation carrier.",
    };
  }
  return {
    kind: "delete-element",
    receiver: source.receiver.expression,
    index: source.argument.expression,
    targetMemberName: mutation.deleteAtMemberName,
  };
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
