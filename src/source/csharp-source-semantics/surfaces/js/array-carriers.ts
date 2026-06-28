import type {
  ExtensionObservation,
  ExtensionObservationContext,
  Node,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  SourceFile,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  acceptObservation,
  deferObservation,
} from "@tsonic/tsts";
import {
  asType,
} from "./source-library.js";
import type {
  CsharpJsSurfaceHost,
} from "./source-library.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
} from "../../ast-utils.js";
import {
  getCsharpCollectionElementTargetType,
  isCsharpDenseMutableCollectionTargetType,
  isCsharpReadOnlyIndexableCollectionTargetType,
} from "../../target-types.js";
import {
  resolveTargetTypeRefFromKeywordTypeSyntax,
} from "../../target-type-keywords.js";
import {
  targetTypeRefIsClosed,
} from "../../target-ref-utils.js";
import {
  getCsharpJsIterableElementType,
} from "./collections.js";
import {
  isSourceStandardLibraryArrayLikeType,
} from "../../source-type-classification.js";
export {
  csharpJsArrayCarrierId,
  csharpJsArrayCarrierTargetType,
  getCsharpJsArrayCarrierElementType,
  isCsharpJsArrayCarrierTargetType,
} from "./array-target-type.js";
import {
  csharpJsArrayCarrierTargetType,
  getCsharpJsArrayCarrierElementType,
  isCsharpJsArrayCarrierTargetType,
} from "./array-target-type.js";

export function getCsharpArrayLikeElementType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  return getCsharpJsArrayCarrierElementType(type) ??
    getCsharpJsIterableElementType(type) ??
    getCsharpCollectionElementTargetType(type);
}

export function getCsharpArrayLengthMember(type: TargetTypeRef | undefined): string | undefined {
  if (type?.kind === "array") {
    return "Length";
  }
  if (isCsharpJsArrayCarrierTargetType(type)) {
    return "length";
  }
  if (isCsharpReadOnlyIndexableCollectionTargetType(type) || isCsharpDenseMutableCollectionTargetType(type)) {
    return "Count";
  }
  return undefined;
}

export function mapCsharpJsArrayRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<RuntimeCarrierFactResult> {
  const carrier = getCsharpJsArrayRuntimeCarrierForType(asType(request.type), context, host);
  return carrier === undefined
    ? deferObservation
    : acceptObservation<RuntimeCarrierFactResult>({
        carrier,
      }, [{ message: "C# JS surface Array runtime carrier mapped from checked JavaScript Array type and resolved element target facts." }]);
}

export function getCsharpJsArrayRuntimeCarrierForType(
  type: Type | undefined,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  if (type === undefined || !isSourceStandardLibraryArrayLikeType(type, context)) {
    return undefined;
  }
  const elementType = getTypeArguments(type, context)
    .map((argument) => host.getTargetTypeRefForSubject(argument, context, {
      allowRuntimeCarrier: true,
      allowSemanticTypeQuery: true,
    }))[0];
  return elementType === undefined
    ? undefined
    : csharpJsArrayCarrierTargetType(elementType);
}

export function getCsharpJsArrayRuntimeCarrierForNode(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  const semanticType = context.compiler?.checker.getTypeAtLocation(node, { sourceFile });
  return getCsharpJsArrayRuntimeCarrierForSyntaxNode(node, context, host) ??
    getCsharpJsArrayRuntimeCarrierForType(semanticType, context, host);
}

function getTypeArguments(type: Type, context: ExtensionObservationContext): readonly Type[] {
  const types = context.compiler?.typeShape;
  if (types === undefined || !types.isTypeReference(type)) {
    return [];
  }
  return types.getTypeArguments(type).filter((argument): argument is Type => argument !== undefined);
}

function getCsharpJsArrayRuntimeCarrierForSyntaxNode(
  node: Node,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined || !ast.is.IsNewExpression(node)) {
    return undefined;
  }
  const typeArguments = getExplicitTypeArgumentNodes(node).map((argument) =>
    argument === undefined
      ? undefined
      : resolveTargetTypeRefFromKeywordTypeSyntax(ast, argument) ??
        host.getTargetTypeRefForSubject(argument, context, {
          allowRuntimeCarrier: true,
          allowSemanticTypeQuery: true,
          sourceFile: ast.getSourceFile(node),
        })
  );
  if (typeArguments.length === 0 || typeArguments.some((argument) => argument === undefined || !targetTypeRefIsClosed(argument))) {
    return undefined;
  }
  return csharpJsArrayCarrierTargetType(typeArguments[0]!);
}

function getExplicitTypeArgumentNodes(node: Node): readonly Node[] {
  const direct = getNodeList(getNodeField(node, "TypeArguments"));
  if (direct.length > 0) {
    return direct;
  }
  const expression = asNodeSubject(getNodeField(node, "Expression"));
  return expression === undefined
    ? []
    : getNodeList(getNodeField(expression, "TypeArguments"));
}
