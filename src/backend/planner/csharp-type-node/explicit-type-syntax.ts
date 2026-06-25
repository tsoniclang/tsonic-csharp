import {
  IsTypeSyntaxNode,
} from "../source-ast.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpTypeNode,
} from "../../roslyn/syntax.js";
import {
  getCsharpTypeFromRuntimeCarrier,
} from "../csharp-type-facts.js";
import {
  getCsharpTypeFromSemanticType,
} from "../csharp-semantic-types.js";
import {
  getCsharpTypeFromArrayBoundaryFact,
  getCsharpTypeFromArrayOrTupleTypeNode,
} from "./array-types.js";
import {
  isDelegateTypeNode,
} from "./callable-types.js";
import {
  getCsharpTypeFromKeywordTypeNode,
} from "./predefined-types.js";
import {
  getCsharpTypeFromTargetBindingForReference,
} from "./provider-types.js";
import type {
  CsharpTypeResolver,
} from "./types.js";

export function getCsharpTypeFromExplicitTypeSyntax(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  resolveCsharpType: CsharpTypeResolver,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  if (!IsTypeSyntaxNode(input.ast, node)) {
    return undefined;
  }
  const arrayBoundaryType = getCsharpTypeFromArrayBoundaryFact(node, input);
  if (arrayBoundaryType !== undefined) {
    return arrayBoundaryType;
  }
  const collectionType = getCsharpTypeFromArrayOrTupleTypeNode(node, sourceFile, input, resolveCsharpType, diagnostics);
  if (collectionType !== undefined) {
    return collectionType;
  }
  const keywordType = getCsharpTypeFromKeywordTypeNode(node, input);
  if (keywordType !== undefined) {
    return keywordType;
  }
  const callableSemanticType = IsTypeSyntaxNode(input.ast, node)
    ? getCsharpTypeFromSemanticType(input.semantics.getTypeFromTypeNode(node, { sourceFile }), sourceFile, input)
    : undefined;
  if (callableSemanticType !== undefined && isDelegateTypeNode(callableSemanticType)) {
    return callableSemanticType;
  }
  const directType = getCsharpTypeFromRuntimeCarrier(node, input);
  if (directType !== undefined) {
    return directType;
  }
  return getCsharpTypeFromTargetBindingForReference(node, sourceFile, input, diagnostics);
}
