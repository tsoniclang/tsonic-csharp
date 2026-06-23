import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  SourceFile,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
} from "./ast-utils.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  isVoidTargetType,
} from "./target-rules.js";
import {
  csharpDelegateTargetType,
} from "./target-types.js";

export interface CsharpCallableTargetTypeHost {
  readonly getTargetTypeRefForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined;
  readonly getTargetTypeRefForType: (
    type: Type | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined;
}

export function getCallableExpressionTargetTypeRef(
  node: Node,
  type: Type,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
  host: CsharpCallableTargetTypeHost,
): TargetTypeRef | undefined {
  const compiler = context.compiler;
  if (compiler === undefined || !isCallableExpressionNode(compiler.ast, node) && !isCallableReferenceNode(compiler.ast, node)) {
    return undefined;
  }
  const options = { allowRuntimeCarrier: false, sourceFile };
  const signature = compiler.types.getCallSignatures(type, { sourceFile })[0];
  if (signature === undefined) {
    return undefined;
  }
  const semanticParameters = ((signature as { readonly parameters?: readonly unknown[] }).parameters ?? [])
    .map((parameter) => host.getTargetTypeRefForType(
      compiler.checker.getTypeOfSymbol(parameter as never, { sourceFile }),
      context,
      options,
    ));
  const parameterNodes = getNodeList(getNodeField(node, "Parameters"));
  const parameters = parameterNodes.length === 0
    ? semanticParameters
    : parameterNodes.map((parameter, index) => {
      const typeNode = asNodeSubject(getNodeField(parameter, "Type"));
      return typeNode === undefined
        ? semanticParameters[index]
        : host.getTargetTypeRefForSubject(typeNode, context, options);
    });
  if (parameters.some((parameter) => parameter === undefined)) {
    return undefined;
  }
  const returnTypeNode = asNodeSubject(getNodeField(node, "Type"));
  const explicitReturnType = returnTypeNode === undefined
    ? undefined
    : host.getTargetTypeRefForSubject(returnTypeNode, context, options);
  const checkedReturnType = explicitReturnType ??
    host.getTargetTypeRefForType(
      compiler.types.getReturnTypeOfSignature(signature, { sourceFile }),
      context,
      options,
    );
  return checkedReturnType === undefined || isVoidTargetType(checkedReturnType)
    ? csharpDelegateTargetType("System.Action", parameters as readonly TargetTypeRef[])
    : csharpDelegateTargetType("System.Func", parameters as readonly TargetTypeRef[], checkedReturnType);
}

export function isCallableExpressionNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  return ast.kindName(node) === "KindArrowFunction" ||
    ast.kindName(node) === "KindFunctionExpression";
}

function isCallableReferenceNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  return ast.is.IsIdentifier(node) ||
    ast.is.IsPropertyAccessExpression(node) ||
    ast.is.IsElementAccessExpression(node);
}
