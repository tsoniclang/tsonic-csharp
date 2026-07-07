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
  getCsharpTypeFromSourcePrimitiveTypeReference,
} from "../csharp-type-facts.js";
import {
  getCsharpTypeFromArrayBoundaryFact,
  getCsharpTypeFromArrayOrTupleTypeNode,
} from "./array-types.js";
import {
  invalidCsharpType,
} from "../csharp-type-primitives.js";
import {
  getCsharpTypeFromKeywordTypeNode,
} from "./predefined-types.js";
import {
  getCsharpTypeFromTargetBindingForReference,
} from "./provider-types.js";
import {
  getTargetTypeRefForNode,
} from "../runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRefWithObjectShapeDeclarations,
} from "../target-type-object-shapes.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
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
import {
  describeSourcePrimitiveEvidence,
  targetTypePreservesSourcePrimitiveEvidence,
} from "../source-primitive-evidence.js";

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
  const projectSourceType = getCsharpTypeFromProjectSourceTypeReferenceNode(node, sourceFile, input, resolveCsharpType, diagnostics);
  if (projectSourceType !== undefined) {
    return projectSourceType;
  }
  const typeAlias = getCsharpTypeFromTypeAliasReferenceNode(node, sourceFile, input, resolveCsharpType, diagnostics);
  if (typeAlias !== undefined) {
    return typeAlias;
  }
  const directTargetType = getTargetTypeRefForNode(input, node, sourceFile);
  const directTargetTypePreservesPrimitiveEvidence = directTargetType === undefined ||
    targetTypePreservesSourcePrimitiveEvidence(input, node, sourceFile, directTargetType);
  if (directTargetType !== undefined) {
    if (directTargetTypePreservesPrimitiveEvidence) {
      const directType = csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, directTargetType, diagnostics, node);
      if (directType !== undefined) {
        return directType;
      }
    }
  }
  const providerType = getCsharpTypeFromTargetBindingForReference(node, sourceFile, input, diagnostics);
  if (providerType !== undefined) {
    return providerType;
  }
  if (directTargetType !== undefined && !directTargetTypePreservesPrimitiveEvidence) {
    diagnostics?.push({
      ...unsupportedNodeDiagnostic(
        node,
        "C# type emission requires transformed source-core primitive type syntax to preserve explicit target primitive evidence; backend must not collapse source-core primitives to TypeScript primitive fallbacks.",
      ),
      evidence: describeSourcePrimitiveEvidence(input, node, sourceFile),
    });
    return invalidCsharpType("source primitive type transform");
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
  return undefined;
}
