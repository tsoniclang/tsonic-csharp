import {
  KindAnyKeyword,
  KindArrayType,
  KindArrayBindingPattern,
  KindObjectBindingPattern,
  KindObjectKeyword,
  KindTypeLiteral,
  KindUnknownKeyword,
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
  getCsharpObjectShapeFactForNode,
} from "./csharp-fact-queries.js";
import {
  csharpTypeFromObjectShapeFact,
} from "./object-shapes.js";
import {
  getTargetTypeRefForNode,
} from "./runtime-carriers.js";
import {
  csharpTargetNamedType,
  csharpSourcePrimitiveTargetType,
  csharpTargetTypeFromBinding,
} from "../../source/csharp-source-semantics/target-types.js";
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
  if (input.ast.kindName(node) === KindArrayType) {
    const elementTypeNode = (node as { readonly ElementType?: Node }).ElementType;
    const elementType = getCsharpTypeForNode(elementTypeNode, sourceFile, input, invalidCsharpType("array element type"), diagnostics);
    return elementType.kind === "InvalidType"
      ? invalidCsharpType("array type")
      : { kind: "ArrayType", elementType };
  }
  const keywordType = getCsharpTypeFromKeywordTypeNode(node, input);
  if (keywordType !== undefined) {
    return keywordType;
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
  const semanticType = getCsharpTypeFromSemanticType(
    input.semantics.getTypeAtLocation(node, { sourceFile }),
    sourceFile,
    input,
  );
  if (semanticType !== undefined) {
    return semanticType;
  }
  const targetBinding = input.semantics.getTargetBindingForReference(node, { sourceFile });
  if (targetBinding !== undefined) {
    const targetType = csharpTargetTypeFromBinding(targetBinding) ?? {
      kind: "target-named" as const,
      id: targetBinding.id,
    };
    const csharpType = targetType === undefined ? undefined : csharpTypeFromTargetTypeRef(targetType);
    if (csharpType !== undefined) {
      return csharpType;
    }
    diagnostics?.push(unsupportedNodeDiagnostic(node, "Provider-owned target type reference requires a renderable target identity before C# emission."));
    return invalidCsharpType("provider target binding");
  }
  const typeDescription = input.semantics.describeTypeAtLocation(node, { sourceFile }) ?? "<unknown>";
  diagnostics?.push(unsupportedNodeDiagnostic(node, `C# emission requires a closed target type from TSTS/provider facts. TSTS type: ${typeDescription}.`));
  return invalidCsharpType("unsupported semantic type");
}

function getCsharpTypeFromSemanticType(
  type: Type | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  seen: ReadonlySet<Type> = new Set(),
): CsharpTypeNode | undefined {
  if (
    type === undefined ||
    seen.has(type) ||
    input.types.isAny(type) ||
    input.types.isUnknown(type)
  ) {
    return undefined;
  }
  const nextSeen = new Set(seen).add(type);
  if (input.types.isArrayLike(type, { sourceFile })) {
    const elementType = input.types.getTypeArguments(type, { sourceFile })[0];
    const csharpElementType = getCsharpTypeFromSemanticType(elementType, sourceFile, input, nextSeen);
    return csharpElementType === undefined
      ? undefined
      : { kind: "ArrayType", elementType: csharpElementType };
  }
  if (input.types.isTuple(type)) {
    const elements = input.types.getTupleElementTypes(type, { sourceFile })
      .map((element) => getCsharpTypeFromSemanticType(element, sourceFile, input, nextSeen));
    return elements.some((element) => element === undefined)
      ? undefined
      : { kind: "TupleType", elements: elements as readonly CsharpTypeNode[] };
  }
  if (input.types.isBooleanLike(type)) {
    return csharpTypeFromTargetTypeRef(csharpSourcePrimitiveTargetType("bool"));
  }
  if (input.types.isNumberLike(type)) {
    return csharpTypeFromTargetTypeRef(csharpSourcePrimitiveTargetType("float64"));
  }
  if (input.types.isStringLike(type)) {
    return csharpTypeFromTargetTypeRef(csharpTargetNamedType("System.String"));
  }
  if (input.types.isBigIntLike(type)) {
    return csharpTypeFromTargetTypeRef(csharpTargetNamedType("System.Numerics.BigInteger"));
  }
  return undefined;
}

function getCsharpTypeFromKeywordTypeNode(node: Node, input: TargetCompileInput): CsharpTypeNode | undefined {
  switch (input.ast.kindName(node)) {
    case "KindBooleanKeyword":
      return csharpTypeFromTargetTypeRef(csharpSourcePrimitiveTargetType("bool"));
    case "KindNumberKeyword":
      return csharpTypeFromTargetTypeRef(csharpSourcePrimitiveTargetType("float64"));
    case "KindStringKeyword":
      return csharpTypeFromTargetTypeRef(csharpTargetNamedType("System.String"));
    case "KindBigIntKeyword":
      return csharpTypeFromTargetTypeRef(csharpTargetNamedType("System.Numerics.BigInteger"));
    case "KindVoidKeyword":
    case "KindNeverKeyword":
      return csharpTypeFromTargetTypeRef(csharpTargetNamedType("System.Void"));
    default:
      return undefined;
  }
}
