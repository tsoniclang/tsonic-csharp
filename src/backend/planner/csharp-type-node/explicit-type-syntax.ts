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
  getCsharpTypeFromSourcePrimitiveTypeReference,
} from "../csharp-type-facts.js";
import {
  getCsharpTypeFromArrayBoundaryFact,
  getCsharpTypeFromArrayOrTupleTypeNode,
} from "./array-types.js";
import {
  getCsharpTypeFromKeywordTypeNode,
} from "./predefined-types.js";
import {
  getCsharpTypeFromTargetBindingForReference,
} from "./provider-types.js";
import {
  getCsharpTypeFromProjectSourceTypeReferenceNode,
} from "../project-source-types.js";
import {
  getCsharpTypeFromFunctionTypeNode,
} from "./function-types.js";
import {
  getCsharpTypeFromTypeAliasReferenceNode,
} from "./type-aliases.js";
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
  const functionType = getCsharpTypeFromFunctionTypeNode(node, sourceFile, input, resolveCsharpType, diagnostics);
  if (functionType !== undefined) {
    return functionType;
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
  const sourcePrimitiveType = getCsharpTypeFromSourcePrimitiveTypeReference(node, sourceFile, input);
  if (sourcePrimitiveType !== undefined) {
    return sourcePrimitiveType;
  }
  const projectSourceType = getCsharpTypeFromProjectSourceTypeReferenceNode(node, sourceFile, input, resolveCsharpType, diagnostics);
  if (projectSourceType !== undefined) {
    return projectSourceType;
  }
  const typeAlias = getCsharpTypeFromTypeAliasReferenceNode(node, sourceFile, input, resolveCsharpType, diagnostics);
  if (typeAlias !== undefined) {
    return typeAlias;
  }
  const directType = getCsharpTypeFromRuntimeCarrier(node, input);
  if (directType !== undefined) {
    return directType;
  }
  return getCsharpTypeFromTargetBindingForReference(node, sourceFile, input, diagnostics);
}
