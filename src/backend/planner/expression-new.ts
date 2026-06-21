import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpArgument,
  CsharpExpression,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import {
  AsNewExpression,
  KindClassDeclaration,
} from "./source-ast.js";
import {
  getCsharpTypeForNode,
} from "./csharp-types.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  invalidExpression,
} from "./invalid-expression.js";
import {
  getCallableSemanticOwnership,
  isSourceOwnedProjectConstructibleObjectSubject,
  pushMissingTargetFactDiagnostic,
} from "./semantic-guards.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  isProviderVirtualSourceFile,
} from "./provider-virtual-source-files.js";
import {
  planSelectedTargetCallArguments,
} from "./expression-target-members.js";
import {
  getRequiredCsharpTargetMemberOperationForSelectedSignature,
} from "./csharp-target-operations.js";

export type CallArgumentPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedType?: CsharpTypeNode,
) => CsharpArgument;

export function planNewExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planCallArgument: CallArgumentPlanner,
): CsharpExpression {
  const expression = AsNewExpression(node)!;
  const selectedTargetCall = input.facts.getSelectedTargetCall(node);
  if (selectedTargetCall !== undefined && selectedTargetCall.member.kind !== "constructor") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `New expression expected a provider constructor fact, but provider selected a ${selectedTargetCall.member.kind} member.`));
    return invalidExpression("selected target constructor");
  }
  const csharpOperation = selectedTargetCall === undefined
    ? undefined
    : getRequiredCsharpTargetMemberOperationForSelectedSignature(input, node, selectedTargetCall, diagnostics, "C# construction emission");
  if (selectedTargetCall !== undefined && csharpOperation === undefined) {
    return invalidExpression("missing C# target constructor operation fact");
  }
  if (csharpOperation !== undefined && csharpOperation.operationKind !== "constructor") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `New expression expected a finalized C# constructor operation fact, but provider recorded '${csharpOperation.operationKind}'.`));
    return invalidExpression("selected target constructor operation");
  }
  if (selectedTargetCall === undefined) {
    const ownership = getCallableSemanticOwnership(expression.Expression, sourceFile, input);
    const sourceConstructible = isProjectSourceClassReference(expression.Expression, sourceFile, input) ||
      isSourceOwnedProjectConstructibleObjectSubject(expression.Expression, sourceFile, input);
    if (!sourceConstructible) {
      pushMissingTargetFactDiagnostic(diagnostics, node, "C# construction emission requires a source-owned constructor or a selected target constructor fact.", {
        requiresTargetFact: true,
        sourceOwned: false,
        reasons: ownership.sourceOwned && ownership.reasons.length === 0 ? ["non-project constructor"] : ownership.reasons,
      });
      return invalidExpression("missing target constructor fact");
    }
  }
  const member = csharpOperation?.selectedMember;
  const selectedConstructorTypeRef = csharpOperation?.resultType;
  if (csharpOperation !== undefined && selectedConstructorTypeRef === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# construction emission requires the finalized constructor operation fact to carry an explicit result target type."));
    return invalidExpression("missing C# constructor result type");
  }
  const selectedConstructorType = selectedConstructorTypeRef === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(selectedConstructorTypeRef);
  return {
    kind: "ObjectCreationExpression",
    type: selectedConstructorType ?? getCsharpTypeForNode(node, sourceFile, input, undefined, diagnostics),
    arguments: member === undefined
      ? (expression.Arguments?.Nodes ?? [])
        .filter((argument): argument is Node => argument !== undefined)
        .map((argument) => planCallArgument(argument, sourceFile, input, diagnostics))
      : planSelectedTargetCallArguments(expression.Expression, expression, member, sourceFile, input, diagnostics, planCallArgument),
  };
}

function isProjectSourceClassReference(node: Node | undefined, sourceFile: SourceFile, input: TargetCompileInput): boolean {
  if (node === undefined) {
    return false;
  }
  const reference = input.semantics.getProjectSourceReferenceForNode(node, { sourceFile });
  if (reference === undefined || input.facts.getTargetBindingFact(reference.symbol) !== undefined) {
    return false;
  }
  return !reference.sourceFile.IsDeclarationFile &&
    !isProviderVirtualSourceFile(input, reference.sourceFile) &&
    input.ast.kindName(reference.declaration) === KindClassDeclaration;
}
