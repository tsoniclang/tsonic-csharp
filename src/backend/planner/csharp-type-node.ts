import {
  KindAnyKeyword,
  KindArrayBindingPattern,
  KindObjectBindingPattern,
  KindObjectKeyword,
  KindTypeLiteral,
  KindUnknownKeyword,
} from "./source-ast.js";
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
} from "../roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  getCsharpObjectShapeFactForNode,
} from "./csharp-fact-queries.js";
import {
  csharpTypeFromObjectShapeFact,
} from "./object-shapes.js";
import {
  getTargetTypeRefForNode,
} from "./runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  invalidCsharpType,
} from "./csharp-type-primitives.js";
import {
  getCsharpTypeForUnionTypeNode,
  getCsharpTypeFromRuntimeCarrier,
  getCsharpTypeFromSelectedTargetCall,
  isUnionTypeNode,
} from "./csharp-type-facts.js";
import {
  getCsharpTypeFromTstsSourceType,
  getSemanticTypeForNode,
  sourceTypeHasProviderEvidence,
} from "./csharp-type-source.js";

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
  const selectedTargetCallType = getCsharpTypeFromSelectedTargetCall(node, input, diagnostics);
  if (selectedTargetCallType !== undefined) {
    return selectedTargetCallType;
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
  if (input.ast.kindName(node) === KindAnyKeyword || input.ast.kindName(node) === KindUnknownKeyword) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "C# emission requires a closed target type; any and unknown cannot trickle into generated C#."));
    return invalidCsharpType("any or unknown type");
  }
  if (input.ast.kindName(node) === KindObjectKeyword) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "C# emission requires a closed target type; TypeScript object is a broad structural carrier and cannot be emitted without provider facts."));
    return invalidCsharpType("object keyword type");
  }
  if (isUnionTypeNode(input, node)) {
    return getCsharpTypeForUnionTypeNode(node, sourceFile, input, diagnostics);
  }
  const nodeCarrierType = getCsharpTypeFromRuntimeCarrier(node, input);
  if (nodeCarrierType !== undefined) {
    return nodeCarrierType;
  }
  if (input.ast.kindName(node) === KindObjectBindingPattern || input.ast.kindName(node) === KindArrayBindingPattern) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Binding patterns require target destructuring lowering before C# type emission."));
    return invalidCsharpType("binding pattern type");
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
  const targetBinding = input.semantics.getTargetBindingForReference(node, { sourceFile });
  if (targetBinding !== undefined) {
    const csharpType = csharpTypeFromTargetTypeRef({ kind: "target-named", id: targetBinding.id });
    if (csharpType !== undefined) {
      return csharpType;
    }
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Provider-owned target type reference requires a renderable target identity before C# emission."));
    return invalidCsharpType("provider target binding");
  }
  const sourceType = getSemanticTypeForNode(input, node, sourceFile);
  if (sourceTypeHasProviderEvidence(sourceType, input)) {
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Provider-owned semantic type requires finalized provider runtime-carrier or target-binding facts before C# emission."));
    return invalidCsharpType("provider semantic type");
  }
  const sourceOwnedType = getCsharpTypeFromTstsSourceType(sourceType, sourceFile, input, diagnostics, node);
  if (sourceOwnedType !== undefined) {
    return sourceOwnedType;
  }
  const typeDescription = input.semantics.describeTypeAtLocation(node, { sourceFile }) ?? "<unknown>";
  diagnostics?.push(unsupportedNodeDiagnostic(node, `C# emission requires a closed target type from TSTS/provider facts. TSTS type: ${typeDescription}.`));
  return invalidCsharpType("unsupported semantic type");
}
