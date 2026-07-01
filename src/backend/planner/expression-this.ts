import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpExpression } from "../roslyn/syntax.js";
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
} from "./source-ast.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import {
  missingCarrierDiagnosticDetail,
  probeCarrierFromResolution,
  resolveRuntimeCarrierForExpression,
} from "./runtime-carriers.js";

export function planThisExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const binding = classifyThisBinding(node, input);
  if (binding.kind === "unsupported") {
    diagnostics.push(unsupportedNodeDiagnostic(node, binding.reason));
    return undefined;
  }
  const carrierResolution = resolveRuntimeCarrierForExpression(input, node, sourceFile);
  if (probeCarrierFromResolution(carrierResolution) === undefined) {
    const detail = missingCarrierDiagnosticDetail(carrierResolution, "Runtime carrier fact is missing for the TSTS-selected this receiver.");
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `C# this emission requires a finalized runtime carrier fact for the TSTS-selected instance receiver. ${detail.reason}`,
      detail.evidence,
    ));
    return undefined;
  }
  return { kind: "IdentifierName", name: "this" };
}

type ThisBindingClassification =
  | { readonly kind: "instance" }
  | { readonly kind: "unsupported"; readonly reason: string };

function classifyThisBinding(node: Node, input: TargetCompileInput): ThisBindingClassification {
  for (let current = input.ast.parent(node); current !== undefined; current = input.ast.parent(current)) {
    if (HasSourceKind(input.ast, current, KindArrowFunction)) {
      continue;
    }
    if (HasSourceKind(input.ast, current, KindConstructor)) {
      return isClassInstanceMember(current, input)
        ? { kind: "instance" }
        : unsupportedThis("constructor outside a class declaration");
    }
    if (
      HasSourceKind(input.ast, current, KindMethodDeclaration) ||
      HasSourceKind(input.ast, current, KindGetAccessor) ||
      HasSourceKind(input.ast, current, KindSetAccessor)
    ) {
      if (!isClassInstanceMember(current, input)) {
        return unsupportedThis("object-literal or non-class method receiver");
      }
      return HasSyntacticModifier(current, ModifierFlagsStatic)
        ? unsupportedThis("static class member receiver")
        : { kind: "instance" };
    }
    if (HasSourceKind(input.ast, current, KindPropertyDeclaration)) {
      return unsupportedThis("class field initializer receiver");
    }
    if (HasSourceKind(input.ast, current, KindClassStaticBlockDeclaration)) {
      return unsupportedThis("class static block receiver");
    }
    if (HasSourceKind(input.ast, current, KindFunctionDeclaration) || HasSourceKind(input.ast, current, KindFunctionExpression)) {
      return unsupportedThis("dynamic function receiver");
    }
    if (HasSourceKind(input.ast, current, KindSourceFile)) {
      return unsupportedThis("top-level module receiver");
    }
  }
  return unsupportedThis("unknown receiver context");
}

function isClassInstanceMember(node: Node, input: TargetCompileInput): boolean {
  return HasSourceKind(input.ast, input.ast.parent(node), KindClassDeclaration);
}

function unsupportedThis(context: string): ThisBindingClassification {
  return {
    kind: "unsupported",
    reason: `C# this emission requires a TSTS-selected instance class receiver; ${context} uses JavaScript this-binding semantics that need explicit target facts and are not emitted as a fallback.`,
  };
}
