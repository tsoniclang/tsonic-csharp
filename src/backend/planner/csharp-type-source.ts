import {
  IsTypeSyntaxNode,
} from "./source-ast.js";
import type {
  Node,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  getTargetTypeRefForType,
} from "./runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  invalidCsharpType,
  predefined,
} from "./csharp-type-primitives.js";

export function getCsharpTypeFromTstsSourceType(
  type: Type | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticNode: Node,
): CsharpTypeNode | undefined {
  if (type === undefined) {
    return undefined;
  }
  if (input.types.isAny(type) || input.types.isUnknown(type)) {
    diagnostics?.push(unsupportedNodeDiagnostic(diagnosticNode, "C# emission requires a closed target type; any and unknown cannot trickle into generated C#."));
    return invalidCsharpType("any or unknown semantic type");
  }
  if (input.types.isVoidLike(type)) {
    return predefined("void");
  }
  if (input.types.isUnion(type)) {
    return undefined;
  }
  const targetRef = getTargetTypeRefForType(input, type, sourceFile);
  if (targetRef !== undefined) {
    return csharpTypeFromTargetTypeRef(targetRef);
  }
  return undefined;
}

export function sourceTypeHasProviderEvidence(
  type: Type | undefined,
  input: TargetCompileInput,
): boolean {
  return type !== undefined && (
    input.facts.getRuntimeCarrierFact(type) !== undefined ||
    input.facts.getRuntimeCarrierFact(type.symbol) !== undefined ||
    input.facts.getTargetBindingFact(type) !== undefined ||
    input.facts.getTargetBindingFact(type.symbol) !== undefined
  );
}

export function getSemanticTypeForNode(
  input: TargetCompileInput,
  node: Node,
  sourceFile: SourceFile,
): Type | undefined {
  return IsTypeSyntaxNode(input.ast, node)
    ? input.semantics.getTypeFromTypeNode(node, { sourceFile })
    : input.semantics.getTypeAtLocation(node, { sourceFile });
}
