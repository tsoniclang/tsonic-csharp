import {
  functionPointerFactKey,
  pointerFactKey,
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
  sourcePrimitiveFactKey,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  csharpSourcePrimitiveTargetType,
} from "./target-types.js";
import {
  resolveRuntimeCarrier,
} from "./target-type-resolution-facts.js";
import {
  asNodeSubject,
  getNodeField,
} from "./ast-utils.js";

export type SubjectTargetTypeResolver = (
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
) => TargetTypeRef | undefined;

export function resolveTargetTypeRefFromSubjectFacts(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  resolveSubject: SubjectTargetTypeResolver,
): TargetTypeRef | undefined {
  const primitive = context.factResolver.resolve(subject, sourcePrimitiveFactKey);
  if (primitive !== undefined) {
    return csharpSourcePrimitiveTargetType(primitive.kind);
  }
  const selectedCallReturn = selectedTargetSignatureReturnType(subject, context);
  if (selectedCallReturn !== undefined) {
    return selectedCallReturn;
  }
  const operationResult = targetOperationResultType(subject, context);
  if (operationResult !== undefined && operationResult !== subject) {
    return resolveSubject(operationResult, context, options);
  }
  const initializerResult = resolveDeclarationInitializerTargetType(subject, context, options, resolveSubject);
  if (initializerResult !== undefined) {
    return initializerResult;
  }
  if (options.allowRuntimeCarrier !== false) {
    const direct = resolveRuntimeCarrier(subject, context) ??
      context.facts.get(subject, runtimeCarrierFactKey)?.carrier;
    if (direct !== undefined) {
      return direct;
    }
  }
  const pointer = context.factResolver.resolve(subject, pointerFactKey);
  if (pointer !== undefined) {
    const pointee = resolveSubject(pointer.pointee, context, options);
    return pointee === undefined
      ? undefined
      : {
          kind: "pointer",
          pointee,
          mutability: pointer.mutability === "readwrite" ? "mut" : pointer.mutability === "readonly" ? "const" : "target-defined",
        };
  }
  const functionPointer = context.factResolver.resolve(subject, functionPointerFactKey);
  if (functionPointer !== undefined) {
    const args = functionPointer.parameters.map((parameter) => resolveSubject(parameter, context, options));
    const result = resolveSubject(functionPointer.result, context, options);
    return result === undefined || args.some((arg) => arg === undefined)
      ? undefined
      : {
          kind: "function-pointer",
          args: args as readonly TargetTypeRef[],
          result,
          ...(functionPointer.abi.length > 0 ? { abi: functionPointer.abi } : {}),
        };
  }
  return undefined;
}

function resolveDeclarationInitializerTargetType(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  resolveSubject: SubjectTargetTypeResolver,
): TargetTypeRef | undefined {
  for (const declaration of declarationSubjectsForInitializerLookup(subject, context)) {
    const initializer = asNodeSubject(getNodeField(declaration, "Initializer")) ??
      asNodeSubject(getNodeField(declaration, "initializer"));
    if (initializer === undefined) {
      continue;
    }
    const selectedReturn = selectedTargetSignatureReturnType(initializer, context);
    if (selectedReturn !== undefined) {
      return selectedReturn;
    }
    const operationResult = targetOperationResultType(initializer, context);
    if (operationResult !== undefined && operationResult !== initializer) {
      return resolveSubject(operationResult, context, options);
    }
  }
  return undefined;
}

function selectedTargetSignatureReturnType(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  return context.factResolver.resolve(subject, selectedTargetSignatureFactKey)?.member.returnType ??
    context.facts.get(subject, selectedTargetSignatureFactKey)?.member.returnType;
}

function targetOperationResultType(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext,
): ExtensionFactSubject | undefined {
  return context.factResolver.resolve(subject, targetOperationFactKey)?.resultType ??
    context.facts.get(subject, targetOperationFactKey)?.resultType;
}

function declarationSubjectsForInitializerLookup(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext,
): readonly Node[] {
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  const direct = node !== undefined && ast?.is.IsVariableDeclaration(node) === true
    ? [node]
    : [];
  const referenceSymbol = node === undefined ? undefined : symbolForInitializerDeclarationLookup(node, context);
  return uniqueNodes([
    ...direct,
    ...symbolDeclarationNodes(subject),
    ...symbolDeclarationNodes(referenceSymbol),
  ]);
}

function symbolForInitializerDeclarationLookup(
  node: Node,
  context: ExtensionObservationContext,
): ExtensionFactSubject | undefined {
  const ast = context.compiler?.ast;
  const checker = context.compiler?.checker;
  if (ast === undefined || checker === undefined) {
    return undefined;
  }
  if (!isInitializerDeclarationSymbolLookupNode(ast, node)) {
    return undefined;
  }
  const sourceFile = ast.getSourceFile(node);
  try {
    return checker.getSymbolAtLocation(node, { sourceFile }) ??
      checker.getResolvedSymbol(node, { sourceFile });
  } catch {
    return undefined;
  }
}

function isInitializerDeclarationSymbolLookupNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  return ast.is.IsIdentifier(node) ||
    ast.is.IsPrivateIdentifier(node) ||
    ast.is.IsQualifiedName(node) ||
    ast.is.IsPropertyAccessExpression(node) ||
    ast.is.IsVariableDeclaration(node) ||
    ast.is.IsParameterDeclaration(node) ||
    ast.is.IsBindingElement(node) ||
    ast.is.IsFunctionDeclaration(node) ||
    ast.is.IsClassDeclaration(node) ||
    ast.is.IsMethodDeclaration(node) ||
    ast.is.IsPropertyDeclaration(node);
}

function symbolDeclarationNodes(subject: ExtensionFactSubject | undefined): readonly Node[] {
  const symbol = subject as {
    readonly Declarations?: unknown;
    readonly declarations?: unknown;
    readonly ValueDeclaration?: unknown;
    readonly valueDeclaration?: unknown;
  } | undefined;
  const declarations = [
    ...nodeArray(symbol?.Declarations),
    ...nodeArray(symbol?.declarations),
  ];
  if (declarations.length > 0) {
    return declarations;
  }
  const valueDeclaration = asNodeSubject(symbol?.ValueDeclaration) ??
    asNodeSubject(symbol?.valueDeclaration);
  return valueDeclaration === undefined ? [] : [valueDeclaration];
}

function nodeArray(value: unknown): readonly Node[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => nodeArray(item));
  }
  const nodes = (value as { readonly Nodes?: unknown } | undefined)?.Nodes;
  if (Array.isArray(nodes)) {
    return nodes.flatMap((item) => nodeArray(item));
  }
  const data = (value as { readonly data?: unknown } | undefined)?.data;
  if (Array.isArray(data)) {
    return data.flatMap((item) => nodeArray(item));
  }
  const dataNode = asNodeSubject(data);
  if (dataNode !== undefined) {
    return [dataNode];
  }
  const single = asNodeSubject(value);
  return single === undefined ? [] : [single];
}

function uniqueNodes(nodes: readonly Node[]): readonly Node[] {
  const seen = new Set<Node>();
  const result: Node[] = [];
  for (const node of nodes) {
    if (seen.has(node)) {
      continue;
    }
    seen.add(node);
    result.push(node);
  }
  return result;
}
