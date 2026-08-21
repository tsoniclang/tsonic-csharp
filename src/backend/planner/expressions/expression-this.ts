import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression } from "../../target-ast/roslyn/index.js";
import {
  HasSourceKind,
  HasSyntacticModifier,
  KindArrowFunction,
  KindClassDeclaration,
  KindClassStaticBlockDeclaration,
  KindConstructor,
  KindFunctionDeclaration,
  KindFunctionExpression,
  KindGetAccessor,
  KindMethodDeclaration,
  KindPropertyDeclaration,
  KindSetAccessor,
  KindSourceFile,
  ModifierFlagsStatic,
} from "@tsonic/target-api/source";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import {
  missingCarrierDiagnosticDetail,
  probeCarrierFromResolution,
  resolveRuntimeCarrierForExpression,
} from "../types/runtime-carriers.js";

export function planThisExpression(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  if (input.scope.sourceThisBinding === undefined) {
    const binding = classifyThisBinding(node, input);
    if (binding.kind === "unsupported") {
      diagnostics.push(unsupportedNodeDiagnostic(node, binding.reason));
      return undefined;
    }
  }
  const runtimeResolution = resolveRuntimeCarrierForExpression(
    input,
    node,
    sourceFile,
  );
  const carrier = input.scope.sourceThisBinding?.targetType ??
    probeCarrierFromResolution(runtimeResolution);
  if (carrier === undefined) {
    const detail = missingCarrierDiagnosticDetail(runtimeResolution, "Runtime carrier fact is missing for the TSTS-selected this receiver.");
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `C# this emission requires a finalized runtime carrier fact for the TSTS-selected instance receiver. ${detail.reason}`,
      detail.evidence,
    ));
    return undefined;
  }
  return {
    kind: "IdentifierName",
    name: input.scope.sourceThisBinding?.name ?? "this",
  };
}

type ThisBindingClassification =
  | { readonly kind: "instance" }
  | { readonly kind: "unsupported"; readonly reason: string };

function classifyThisBinding(node: Node, input: CsharpPlanningContext): ThisBindingClassification {
  for (let current = input.program.source.ast.parent(node); current !== undefined; current = input.program.source.ast.parent(current)) {
    if (HasSourceKind(input.program.source.ast, current, KindArrowFunction)) {
      continue;
    }
    if (HasSourceKind(input.program.source.ast, current, KindConstructor)) {
      return isClassInstanceMember(current, input)
        ? { kind: "instance" }
        : unsupportedThis("constructor outside a class declaration");
    }
    if (
      HasSourceKind(input.program.source.ast, current, KindMethodDeclaration) ||
      HasSourceKind(input.program.source.ast, current, KindGetAccessor) ||
      HasSourceKind(input.program.source.ast, current, KindSetAccessor)
    ) {
      if (!isClassInstanceMember(current, input)) {
        return unsupportedThis("object-literal or non-class method receiver");
      }
      return HasSyntacticModifier(input.program.source.ast, current, ModifierFlagsStatic)
        ? unsupportedThis("static class member receiver")
        : { kind: "instance" };
    }
    if (HasSourceKind(input.program.source.ast, current, KindPropertyDeclaration)) {
      return unsupportedThis("class field initializer receiver");
    }
    if (HasSourceKind(input.program.source.ast, current, KindClassStaticBlockDeclaration)) {
      return unsupportedThis("class static block receiver");
    }
    if (HasSourceKind(input.program.source.ast, current, KindFunctionDeclaration) || HasSourceKind(input.program.source.ast, current, KindFunctionExpression)) {
      return unsupportedThis("runtime-bound function receiver");
    }
    if (HasSourceKind(input.program.source.ast, current, KindSourceFile)) {
      return unsupportedThis("top-level module receiver");
    }
  }
  return unsupportedThis("unknown receiver context");
}

function isClassInstanceMember(node: Node, input: CsharpPlanningContext): boolean {
  return HasSourceKind(input.program.source.ast, input.program.source.ast.parent(node), KindClassDeclaration);
}

function unsupportedThis(context: string): ThisBindingClassification {
  return {
    kind: "unsupported",
    reason: `C# this emission requires a TSTS-selected instance class receiver; ${context} uses JavaScript this-binding semantics that need explicit target facts before emission.`,
  };
}
