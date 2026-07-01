import {
  KindArrowFunction,
  KindFunctionExpression,
  KindTypeLiteral,
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
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  getCsharpObjectShapeFactForNode,
} from "../csharp-fact-queries.js";
import {
  csharpTypeFromObjectShapeFact,
} from "../object-shapes.js";
import {
  getTargetTypeRefForNode,
} from "../runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";
import {
  invalidCsharpType,
} from "../csharp-type-primitives.js";
import {
  getCsharpTypeForUnionTypeNode,
  getCsharpTypeFromRuntimeCarrier,
  getCsharpTypeFromSelectedTargetCall,
  getCsharpTypeFromSourceCoreTypeMarkerFact,
  isUnionTypeNode,
} from "../csharp-type-facts.js";
import {
  getCsharpTypeParameterName,
} from "../csharp-semantic-types.js";
import {
  getCsharpTypeFromArrayBoundaryFact,
  getCsharpTypeFromArrayOrTupleTypeNode,
} from "./array-types.js";
import {
  getCsharpCallableContextualType,
} from "./callable-types.js";
import {
  getCsharpTypeFromExplicitTypeSyntax,
} from "./explicit-type-syntax.js";
import {
  getCsharpTypeFromTargetConversion,
  getCsharpTypeFromUnsupportedBindingPattern,
  getCsharpTypeFromUnsupportedBroadTypeNode,
} from "./fail-closed-types.js";
import {
  getCsharpTypeFromKeywordTypeNode,
} from "./predefined-types.js";
import {
  getCsharpTypeFromTargetBindingForReference,
} from "./provider-types.js";
import {
  getCsharpTypeFromResolvedSourceCallReturn,
  getCsharpTypeFromSourceNewExpression,
} from "./source-generic-types.js";

export function getCsharpTypeForNode(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  errorType: CsharpTypeNode = invalidCsharpType("missing C# type"),
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode {
  if (node === undefined) {
    return errorType;
  }
  const sourceNewExpressionType = getCsharpTypeFromSourceNewExpression(node, sourceFile, input, getCsharpTypeForNode, diagnostics);
  if (sourceNewExpressionType !== undefined) {
    return sourceNewExpressionType;
  }
  const sourceCallReturnType = getCsharpTypeFromResolvedSourceCallReturn(node, sourceFile, input, getCsharpTypeForNode, diagnostics);
  if (sourceCallReturnType !== undefined) {
    return sourceCallReturnType;
  }
  const selectedTargetCallType = getCsharpTypeFromSelectedTargetCall(node, input, diagnostics);
  if (selectedTargetCallType !== undefined) {
    return selectedTargetCallType;
  }
  const targetConversionType = getCsharpTypeFromTargetConversion(node, input, diagnostics);
  if (targetConversionType !== undefined) {
    return targetConversionType;
  }
  const sourceCoreTypeMarker = getCsharpTypeFromSourceCoreTypeMarkerFact(node, input, diagnostics);
  if (sourceCoreTypeMarker !== undefined) {
    return sourceCoreTypeMarker;
  }
  if (input.ast.kindName(node) === KindTypeLiteral) {
    const objectShape = getCsharpObjectShapeFactForNode(node, sourceFile, input);
    const objectShapeType = objectShape === undefined
      ? undefined
      : csharpTypeFromObjectShapeFact(input, objectShape, diagnostics, node);
    if (objectShapeType !== undefined) {
      return objectShapeType;
    }
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Structural object type annotations require target object-shape semantics before C# emission."));
    return invalidCsharpType("structural object type");
  }
  const unsupportedBroadType = getCsharpTypeFromUnsupportedBroadTypeNode(node, input, diagnostics);
  if (unsupportedBroadType !== undefined) {
    return unsupportedBroadType;
  }
  if (isUnionTypeNode(input, node)) {
    return getCsharpTypeForUnionTypeNode(node, sourceFile, input, diagnostics);
  }
  const nodeType = IsTypeSyntaxNode(input.ast, node)
    ? input.analysis.getTypeFromTypeNode(node, { sourceFile })
    : input.analysis.getTypeAtLocation(node, { sourceFile });
  const nodeTypeParameterName = nodeType === undefined
    ? undefined
    : getCsharpTypeParameterName(nodeType, input);
  if (nodeTypeParameterName !== undefined) {
    return { kind: "IdentifierName", name: nodeTypeParameterName };
  }
  if (input.ast.kindName(node) === KindArrowFunction || input.ast.kindName(node) === KindFunctionExpression) {
    const contextualCallableType = getCsharpCallableContextualType(node, input);
    if (contextualCallableType !== undefined) {
      return contextualCallableType;
    }
  }
  const explicitTypeSyntax = getCsharpTypeFromExplicitTypeSyntax(node, sourceFile, input, getCsharpTypeForNode, diagnostics);
  if (explicitTypeSyntax !== undefined) {
    return explicitTypeSyntax;
  }
  const arrayBoundaryType = getCsharpTypeFromArrayBoundaryFact(node, input);
  const nodeCarrierType = getCsharpTypeFromRuntimeCarrier(node, input);
  if (nodeCarrierType !== undefined) {
    return nodeCarrierType;
  }
  if (arrayBoundaryType !== undefined) {
    return arrayBoundaryType;
  }
  const collectionType = getCsharpTypeFromArrayOrTupleTypeNode(node, sourceFile, input, getCsharpTypeForNode, diagnostics);
  if (collectionType !== undefined) {
    return collectionType;
  }
  const keywordType = getCsharpTypeFromKeywordTypeNode(node, input);
  if (keywordType !== undefined) {
    return keywordType;
  }
  const targetBindingType = getCsharpTypeFromTargetBindingForReference(node, sourceFile, input, diagnostics);
  if (targetBindingType !== undefined) {
    return targetBindingType;
  }
  const unsupportedBindingPatternType = getCsharpTypeFromUnsupportedBindingPattern(node, input, diagnostics);
  if (unsupportedBindingPatternType !== undefined) {
    return unsupportedBindingPatternType;
  }
  const contextualTargetType = input.facts.getContextualTargetTypeFact(node)?.targetType;
  if (contextualTargetType !== undefined) {
    const csharpType = csharpTypeFromTargetTypeRef(contextualTargetType);
    if (csharpType !== undefined) {
      return csharpType;
    }
  }
  const nodeRuntimeCarrier = getTargetTypeRefForNode(input, node, sourceFile);
  if (nodeRuntimeCarrier !== undefined) {
    const csharpType = csharpTypeFromTargetTypeRef(nodeRuntimeCarrier);
    if (csharpType !== undefined) {
      return csharpType;
    }
  }
  void nodeType;
  const sourceText = input.ast.text(node);
  diagnostics?.push(unsupportedNodeDiagnostic(node, `C# emission requires a closed target type from TSTS/provider facts; backend diagnostics must not render semantic type strings as C# type evidence. Kind: ${input.ast.kindName(node)}.${sourceText.length === 0 ? "" : ` Source: ${sourceText}.`}`));
  return invalidCsharpType("unsupported semantic type");
}
