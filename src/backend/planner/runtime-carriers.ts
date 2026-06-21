import type { ExtensionFactSubject, Node, SourceFile, TargetTypeRef, Type } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import {
  IsTypeSyntaxNode,
  KindClassDeclaration,
  KindEnumDeclaration,
  KindInterfaceDeclaration,
  KindTypeLiteral,
} from "./source-ast.js";

export function getRuntimeCarrierForExpression(
  input: TargetCompileInput,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  return getTargetTypeRefForNode(input, sourceNode, sourceFile);
}

export function getTargetTypeRefForNode(
  input: TargetCompileInput,
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  if (sourceNode === undefined) {
    return undefined;
  }
  return getTargetTypeRefFromDirectFacts(input, sourceNode) ??
    input.semantics.getRuntimeCarrierForNode(sourceNode, { sourceFile }) ??
    getTargetTypeRefFromDirectFacts(input, input.semantics.getSymbolAtLocation(sourceNode, { sourceFile })) ??
    getTargetTypeRefFromDirectFacts(input, input.semantics.getResolvedSymbol(sourceNode, { sourceFile })) ??
    getTargetTypeRefFromSelectedOperation(input, sourceNode, sourceFile) ??
    getCatchVariableTargetTypeRef(input, sourceNode, sourceFile) ??
    getTargetTypeRefForType(input, getSemanticTypeForNode(input, sourceNode, sourceFile), sourceFile);
}

function getCatchVariableTargetTypeRef(
  input: TargetCompileInput,
  sourceNode: Node,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  const symbol = input.semantics.getSymbolAtLocation(sourceNode, { sourceFile });
  const declarations = getSymbolDeclarations(symbol);
  return declarations.some((declaration) => {
      const parent = asNode(getNodeField(declaration, "Parent"));
      return input.ast.kindName(parent) === "KindCatchClause";
    })
    ? { kind: "target-named", id: "System.Exception" }
    : undefined;
}

function getTargetTypeRefFromSelectedOperation(
  input: TargetCompileInput,
  sourceNode: Node,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  const resultType = input.facts.getSelectedTargetOperator(sourceNode)?.resultType ??
    input.facts.getSelectedTargetProperty(sourceNode)?.resultType ??
    input.facts.getSelectedTargetElementAccess(sourceNode)?.resultType ??
    input.facts.getSelectedTargetCall(sourceNode)?.member.returnType;
  return resultType === undefined || resultType === sourceNode
    ? undefined
    : getTargetTypeRefFromDirectFacts(input, resultType) ??
      (asNode(resultType) === undefined ? undefined : getTargetTypeRefForNode(input, asNode(resultType), sourceFile));
}

export function getTargetTypeRefForType(
  input: TargetCompileInput,
  type: Type | undefined,
  sourceFile: SourceFile,
  seen: ReadonlySet<Type> = new Set(),
): TargetTypeRef | undefined {
  if (type === undefined || seen.has(type)) {
    return undefined;
  }
  const direct = getTargetTypeRefFromDirectFacts(input, type) ??
    getTargetTypeRefFromDirectFacts(input, type.symbol);
  if (direct !== undefined) {
    return direct;
  }
  const typeParameterName = getTypeParameterName(input, type);
  if (typeParameterName !== undefined) {
    return { kind: "type-parameter", name: typeParameterName };
  }
  const declaredSourceType = getProjectSourceDeclaredTargetTypeRef(input, type, sourceFile, seen);
  if (declaredSourceType !== undefined) {
    return declaredSourceType;
  }
  return getTargetTypeRefForProjectSourceType(input, type, sourceFile);
}

function getProjectSourceDeclaredTargetTypeRef(
  input: TargetCompileInput,
  type: Type,
  sourceFile: SourceFile,
  seen: ReadonlySet<Type>,
): TargetTypeRef | undefined {
  const declaration = getSymbolDeclarations(type.symbol)
    .find((candidate) =>
      input.ast.kindName(candidate) === KindClassDeclaration ||
      input.ast.kindName(candidate) === KindInterfaceDeclaration ||
      input.ast.kindName(candidate) === KindEnumDeclaration
    );
  if (declaration === undefined) {
    return undefined;
  }
  const declarationSourceFile = input.ast.getSourceFile(declaration);
  const declarationFileName = declarationSourceFile === undefined ? "" : input.ast.getFileName(declarationSourceFile);
  if (declarationSourceFile?.IsDeclarationFile === true || declarationFileName.startsWith("tsts-provider://")) {
    return undefined;
  }
  const symbolName = type.symbol?.Name;
  if (symbolName === undefined || symbolName.length === 0) {
    return undefined;
  }
  const typeArguments = input.types.isTypeReference(type)
    ? input.types.getTypeArguments(type, { sourceFile })
      .map((argument) => getTargetTypeRefForType(input, argument, sourceFile, new Set(seen).add(type)))
    : [];
  if (typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  return {
    kind: "target-named",
    id: symbolName,
    ...(typeArguments.length > 0 ? { typeArguments: typeArguments as readonly TargetTypeRef[] } : {}),
  };
}

function getTargetTypeRefFromDirectFacts(
  input: TargetCompileInput,
  subject: ExtensionFactSubject | undefined,
): TargetTypeRef | undefined {
  if (subject === undefined) {
    return undefined;
  }
  const targetTypeRef = asTargetTypeRef(subject);
  if (targetTypeRef !== undefined) {
    return targetTypeRef;
  }
  const runtimeCarrier = input.facts.getRuntimeCarrierFact(subject)?.carrier;
  if (runtimeCarrier !== undefined) {
    return runtimeCarrier;
  }
  const pointer = input.facts.getPointerFact(subject);
  if (pointer !== undefined) {
    const pointee = getTargetTypeRefFromDirectFacts(input, pointer.pointee);
    if (pointee !== undefined) {
      return {
        kind: "pointer",
        pointee,
        mutability: pointer.mutability === "readwrite" ? "mut" : pointer.mutability === "readonly" ? "const" : "target-defined",
      };
    }
  }
  const functionPointer = input.facts.getFunctionPointerFact(subject);
  if (functionPointer !== undefined) {
    const args = functionPointer.parameters.map((parameter) => getTargetTypeRefFromDirectFacts(input, parameter));
    const result = getTargetTypeRefFromDirectFacts(input, functionPointer.result);
    if (result !== undefined && args.every((argument) => argument !== undefined)) {
      return {
        kind: "function-pointer",
        args: args as readonly TargetTypeRef[],
        result,
        ...(functionPointer.abi.length > 0 ? { abi: functionPointer.abi } : {}),
      };
    }
  }
  const primitive = input.facts.getSourcePrimitiveFact(subject);
  if (primitive !== undefined) {
    return { kind: "source-primitive", name: primitive.kind };
  }
  const binding = input.facts.getTargetBindingFact(subject);
  if (binding !== undefined) {
    return { kind: "target-named", id: binding.id };
  }
  return undefined;
}

function asTargetTypeRef(subject: unknown): TargetTypeRef | undefined {
  if (typeof subject !== "object" || subject === null) {
    return undefined;
  }
  const kind = (subject as { readonly kind?: unknown }).kind;
  switch (kind) {
    case "source-primitive":
    case "target-named":
    case "type-parameter":
    case "array":
    case "tuple":
    case "pointer":
    case "function-pointer":
    case "opaque":
    case "associated-type":
    case "lifetime":
    case "target-specific":
      return subject as TargetTypeRef;
    default:
      return undefined;
  }
}

function getTypeParameterName(input: TargetCompileInput, type: Type): string | undefined {
  const declarations = (type.symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations ?? [];
  for (const declaration of declarations) {
    if (!input.ast.is.IsTypeParameterDeclaration(declaration)) {
      continue;
    }
    const name = (declaration as { readonly name?: { readonly Text?: unknown }; readonly Name?: { readonly Text?: unknown } }).name ??
      (declaration as { readonly Name?: { readonly Text?: unknown } }).Name;
    const text = name?.Text;
    if (typeof text === "string" && text.length > 0) {
      return text;
    }
  }
  return undefined;
}

function getNodeField(node: Node | undefined, field: string): unknown {
  if (node === undefined) {
    return undefined;
  }
  const record = node as unknown as Record<string, unknown>;
  const exact = record[field];
  if (exact !== undefined) {
    return exact;
  }
  const alternate = `${field[0]!.toLowerCase()}${field.slice(1)}`;
  return record[alternate];
}

function getSemanticTypeForNode(
  input: TargetCompileInput,
  sourceNode: Node,
  sourceFile: SourceFile,
): Type | undefined {
  return IsTypeSyntaxNode(input.ast, sourceNode)
    ? input.semantics.getTypeFromTypeNode(sourceNode, { sourceFile })
    : input.semantics.getTypeAtLocation(sourceNode, { sourceFile });
}

function getSymbolDeclarations(symbol: ExtensionFactSubject | undefined): readonly Node[] {
  return (symbol as { readonly Declarations?: readonly Node[]; readonly ValueDeclaration?: Node } | undefined)?.Declarations ??
    ((symbol as { readonly ValueDeclaration?: Node } | undefined)?.ValueDeclaration === undefined ? [] : [(symbol as { readonly ValueDeclaration?: Node }).ValueDeclaration!]);
}

function asNode(value: unknown): Node | undefined {
  return typeof value === "object" &&
    value !== null &&
    typeof (value as { readonly Kind?: unknown }).Kind === "number"
    ? value as Node
    : undefined;
}

function getTargetTypeRefForProjectSourceType(
  input: TargetCompileInput,
  type: Type,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  const declaration = (type.symbol as { readonly ValueDeclaration?: Node; readonly Declarations?: readonly Node[] } | undefined)?.ValueDeclaration ??
    (type.symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations?.find((candidate) => candidate !== undefined);
  if (declaration === undefined) {
    return undefined;
  }
  const declarationFile = input.ast.getSourceFile(declaration);
  if (declarationFile === undefined ||
    declarationFile.IsDeclarationFile ||
    input.ast.getFileName(declarationFile).startsWith("bundled:///libs/") ||
    (declarationFile !== sourceFile && !input.sourceFiles.includes(declarationFile)) ||
    input.ast.kindName(declaration) === KindTypeLiteral) {
    return undefined;
  }
  const name = type.symbol?.Name;
  if (typeof name !== "string" || name.length === 0) {
    return undefined;
  }
  const typeArguments = input.types.isTypeReference?.(type) === true
    ? input.types.getTypeArguments(type, { sourceFile })
      .map((argument) => getTargetTypeRefForType(input, argument, sourceFile))
    : [];
  if (typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  return {
    kind: "target-specific",
    target: "csharp",
    name: "project-source-type",
    value: {
      name,
      ...(typeArguments.length > 0 ? { typeArguments: typeArguments as readonly TargetTypeRef[] } : {}),
    },
  };
}
