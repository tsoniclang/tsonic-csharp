import {
  AsCallExpression,
  AsNewExpression,
  AsPropertyAccessExpression,
  KindCallExpression,
  KindNewExpression,
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
  getCallableSemanticOwnership,
} from "../semantic-guards.js";
import {
  invalidCsharpType,
} from "../csharp-type-primitives.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";
import {
  getCsharpTypeFromProjectSourceReference,
} from "../project-source-types.js";
import type {
  CsharpTypeResolver,
} from "./types.js";

export function getCsharpTypeFromResolvedSourceCallReturn(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  resolveCsharpType: CsharpTypeResolver,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  if (input.ast.kindName(node) !== KindCallExpression) {
    return undefined;
  }
  const call = AsCallExpression(node)!;
  const ownership = getCallableSemanticOwnership(call.Expression, sourceFile, input);
  if (!ownership.sourceOwned) {
    return undefined;
  }
  const annotatedReturnType = getCsharpTypeFromSourceCallReturnAnnotation(node, call, sourceFile, input, resolveCsharpType, diagnostics);
  if (annotatedReturnType !== undefined) {
    return annotatedReturnType;
  }
  const carrier = input.semantics.getResolvedCallReturnRuntimeCarrier(node, { sourceFile });
  if (carrier !== undefined) {
    const csharpType = csharpTypeFromTargetTypeRef(carrier);
    if (csharpType === undefined) {
      diagnostics?.push(unsupportedNodeDiagnostic(node, "Resolved source call return carrier requires a renderable C# type before emission."));
      return invalidCsharpType("source call return carrier");
    }
    return csharpType;
  }
  diagnostics?.push(unsupportedNodeDiagnostic(node, "Source-owned call return emission requires a finalized return carrier fact; backend must not infer C# return types from raw TSTS semantic types."));
  return invalidCsharpType("source call return carrier");
}

export function getCsharpTypeFromSourceNewExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  resolveCsharpType: CsharpTypeResolver,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  if (input.ast.kindName(node) !== KindNewExpression) {
    return undefined;
  }
  const expression = AsNewExpression(node);
  const reference = expression === undefined
    ? undefined
    : input.semantics.getProjectSourceReferenceForNode(expression.Expression, { sourceFile });
  if (expression === undefined || reference === undefined || !input.ast.is.IsClassDeclaration(reference.declaration)) {
    return undefined;
  }
  const baseType = getCsharpTypeFromProjectSourceReference(reference, input, diagnostics);
  if (baseType === undefined) {
    return undefined;
  }
  const typeArguments = input.ast.typeArguments(node)
    .filter((argument): argument is Node => argument !== undefined)
    .map((argument) => resolveCsharpType(argument, sourceFile, input, invalidCsharpType("source construction type argument"), diagnostics));
  return withCsharpTypeArguments(baseType, typeArguments);
}

function getCsharpTypeFromSourceCallReturnAnnotation(
  node: Node,
  call: ReturnType<typeof AsCallExpression>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  resolveCsharpType: CsharpTypeResolver,
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  if (call === undefined) {
    return undefined;
  }
  const reference = input.semantics.getProjectSourceReferenceForNode(call.Expression, { sourceFile });
  const returnTypeNode = (reference?.declaration as { readonly Type?: Node } | undefined)?.Type;
  if (reference === undefined || returnTypeNode === undefined) {
    return undefined;
  }
  const substitutions = getSourceCallTypeParameterSubstitutions(node, call, reference.declaration, sourceFile, input, resolveCsharpType, diagnostics);
  const returnType = resolveCsharpType(returnTypeNode, reference.sourceFile, input, invalidCsharpType("source call return type"), diagnostics);
  return substituteCsharpTypeNode(returnType, substitutions);
}

export function getSourceCallTypeParameterSubstitutions(
  node: Node,
  call: NonNullable<ReturnType<typeof AsCallExpression>>,
  selectedDeclaration: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  resolveCsharpType: CsharpTypeResolver,
  diagnostics?: TargetDiagnostic[],
): ReadonlyMap<string, CsharpTypeNode> {
  const substitutions = new Map<string, CsharpTypeNode>();
  const callee = AsPropertyAccessExpression(call.Expression);
  const receiver = callee?.Expression;
  if (receiver !== undefined) {
    const receiverType = resolveCsharpType(receiver, sourceFile, input, invalidCsharpType("source call receiver type"), diagnostics);
    addCsharpTypeParameterSubstitutions(input, substitutions, input.ast.parent(selectedDeclaration), getCsharpTypeArguments(receiverType));
  }
  const explicitTypeArguments = input.ast.typeArguments(node)
    .filter((argument): argument is Node => argument !== undefined)
    .map((argument) => resolveCsharpType(argument, sourceFile, input, invalidCsharpType("source call type argument"), diagnostics));
  if (explicitTypeArguments.length > 0) {
    addCsharpTypeParameterSubstitutions(input, substitutions, selectedDeclaration, explicitTypeArguments);
  }
  return substitutions;
}

function addCsharpTypeParameterSubstitutions(
  input: TargetCompileInput,
  substitutions: Map<string, CsharpTypeNode>,
  declaration: Node | undefined,
  typeArguments: readonly CsharpTypeNode[],
): void {
  if (declaration === undefined || typeArguments.length === 0) {
    return;
  }
  const typeParameters = input.ast.typeParameters(declaration);
  for (let index = 0; index < typeParameters.length; index += 1) {
    const name = input.ast.text(input.ast.name(typeParameters[index]));
    const typeArgument = typeArguments[index];
    if (name.length > 0 && typeArgument !== undefined) {
      substitutions.set(name, typeArgument);
    }
  }
}

function getCsharpTypeArguments(type: CsharpTypeNode): readonly CsharpTypeNode[] {
  return type.kind === "IdentifierName" || type.kind === "QualifiedName"
    ? type.typeArguments ?? []
    : [];
}

function withCsharpTypeArguments(
  type: CsharpTypeNode,
  typeArguments: readonly CsharpTypeNode[],
): CsharpTypeNode {
  if (typeArguments.length === 0) {
    return type;
  }
  return type.kind === "IdentifierName" || type.kind === "QualifiedName"
    ? { ...type, typeArguments }
    : type;
}

export function substituteCsharpTypeNode(
  type: CsharpTypeNode,
  substitutions: ReadonlyMap<string, CsharpTypeNode>,
): CsharpTypeNode {
  if (substitutions.size === 0) {
    return type;
  }
  switch (type.kind) {
    case "IdentifierName":
      return substitutions.get(type.name) ?? {
        ...type,
        ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => substituteCsharpTypeNode(argument, substitutions)) }),
      };
    case "QualifiedName":
      return {
        ...type,
        left: substituteCsharpTypeNode(type.left, substitutions),
        ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => substituteCsharpTypeNode(argument, substitutions)) }),
      };
    case "ArrayType":
      return { ...type, elementType: substituteCsharpTypeNode(type.elementType, substitutions) };
    case "TupleType":
      return { ...type, elements: type.elements.map((element) => substituteCsharpTypeNode(element, substitutions)) };
    case "PointerType":
      return { ...type, pointee: substituteCsharpTypeNode(type.pointee, substitutions) };
    case "FunctionPointerType":
      return {
        ...type,
        parameters: type.parameters.map((parameter) => substituteCsharpTypeNode(parameter, substitutions)),
        returnType: substituteCsharpTypeNode(type.returnType, substitutions),
      };
    case "NullableType":
      return { ...type, inner: substituteCsharpTypeNode(type.inner, substitutions) };
    case "PredefinedType":
    case "InvalidType":
      return type;
  }
}
