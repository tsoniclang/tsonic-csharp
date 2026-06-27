import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpArgument,
  CsharpExpression,
} from "../roslyn/syntax.js";
import type {
  CallArgumentPlanner,
} from "./expression-planner-types.js";
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
} from "./expression-target-members/index.js";
import {
  getRequiredCsharpTargetMemberOperationForSelectedSignature,
} from "./csharp-target-operations.js";
import {
  tryPlanCompatRuntimeConstruct,
} from "./compat-runtime-operations.js";

export function planNewExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  const expression = AsNewExpression(node)!;
  const compatDiagnosticsStart = diagnostics.length;
  const compatRuntimeConstruct = tryPlanCompatRuntimeConstruct(
    node,
    expression.Expression,
    expression.Arguments?.Nodes ?? [],
    sourceFile,
    input,
    diagnostics,
    (argumentNode, argumentSourceFile, argumentInput, argumentDiagnostics) => {
      const argument = planCallArgument(argumentNode, argumentSourceFile, argumentInput, argumentDiagnostics);
      return argument?.expression;
    },
  );
  if (compatRuntimeConstruct !== undefined) {
    return compatRuntimeConstruct;
  }
  if (diagnostics.length > compatDiagnosticsStart) {
    return undefined;
  }
  const ownership = getCallableSemanticOwnership(expression.Expression, sourceFile, input);
  const sourceConstructible = isProjectSourceClassReference(expression.Expression, sourceFile, input) ||
    isSourceOwnedProjectConstructibleObjectSubject(expression.Expression, sourceFile, input);
  const selectedTargetCall = sourceConstructible ? undefined : input.facts.getSelectedTargetCall(node);
  if (selectedTargetCall !== undefined && selectedTargetCall.member.kind !== "constructor") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `New expression expected a provider constructor fact, but provider selected a ${selectedTargetCall.member.kind} member.`));
    return undefined;
  }
  const csharpOperation = selectedTargetCall === undefined
    ? undefined
    : getRequiredCsharpTargetMemberOperationForSelectedSignature(input, node, selectedTargetCall, diagnostics, "C# construction emission");
  if (selectedTargetCall !== undefined && csharpOperation === undefined) {
    return undefined;
  }
  if (csharpOperation !== undefined && csharpOperation.operationKind !== "constructor") {
    diagnostics.push(unsupportedNodeDiagnostic(node, `New expression expected a finalized C# constructor operation fact, but provider recorded '${csharpOperation.operationKind}'.`));
    return undefined;
  }
  if (selectedTargetCall === undefined) {
    if (!sourceConstructible) {
      pushMissingTargetFactDiagnostic(diagnostics, node, "C# construction emission requires a source-owned constructor or a selected target constructor fact.", {
        requiresTargetFact: true,
        sourceOwned: false,
        reasons: ownership.sourceOwned && ownership.reasons.length === 0 ? ["non-project constructor"] : ownership.reasons,
      });
      return undefined;
    }
  }
  const member = csharpOperation?.selectedMember;
  const selectedConstructorTypeRef = csharpOperation?.resultType;
  if (csharpOperation !== undefined && selectedConstructorTypeRef === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# construction emission requires the finalized constructor operation fact to carry an explicit result target type."));
    return undefined;
  }
  const selectedConstructorType = selectedConstructorTypeRef === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(selectedConstructorTypeRef);
  const arguments_ = member === undefined
    ? planSourceConstructorArguments(expression.Arguments?.Nodes ?? [], sourceFile, input, diagnostics, planCallArgument)
    : planSelectedTargetCallArguments(expression.Expression, expression, member, csharpOperation?.argumentArrayLiteralElementTypes, sourceFile, input, diagnostics, planCallArgument);
  if (arguments_ === undefined) {
    return undefined;
  }
  return {
    kind: "ObjectCreationExpression",
    type: selectedConstructorType ?? getCsharpTypeForNode(node, sourceFile, input, undefined, diagnostics),
    arguments: arguments_,
  };
}

function planSourceConstructorArguments(
  argumentNodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planCallArgument: CallArgumentPlanner,
): readonly CsharpArgument[] | undefined {
  const planned: CsharpArgument[] = [];
  for (const argument of argumentNodes) {
    if (argument === undefined) {
      continue;
    }
    const plannedArgument = planCallArgument(argument, sourceFile, input, diagnostics);
    if (plannedArgument === undefined) {
      return undefined;
    }
    planned.push(plannedArgument);
  }
  return planned;
}

function isProjectSourceClassReference(node: Node | undefined, sourceFile: SourceFile, input: TargetCompileInput): boolean {
  if (node === undefined) {
    return false;
  }
  const reference = input.analysis.getProjectSourceReferenceForNode(node, { sourceFile });
  if (reference === undefined || input.facts.getTargetBindingFact(reference.symbol) !== undefined) {
    return false;
  }
  return !reference.sourceFile.IsDeclarationFile &&
    !isProviderVirtualSourceFile(input, reference.sourceFile) &&
    input.ast.kindName(reference.declaration) === KindClassDeclaration;
}
