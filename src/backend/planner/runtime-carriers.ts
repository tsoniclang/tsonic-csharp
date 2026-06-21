import type { Node, SourceFile, TargetTypeRef, Type } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import {
  KindClassDeclaration,
  KindEnumDeclaration,
  KindInterfaceDeclaration,
  KindTypeLiteral,
} from "./source-ast.js";
import {
  getTargetTypeRefFromDirectFacts,
} from "./runtime-carrier-direct-facts.js";
import {
  asNode,
  getNodeField,
  getSemanticTypeForNode,
  getSymbolDeclarations,
  getTypeParameterName,
} from "./runtime-carrier-node-utils.js";

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
