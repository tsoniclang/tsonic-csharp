import {
  fieldFactKey,
  structFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  FieldFact,
  Node,
  SourceFile,
  StructFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
} from "../../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeNameText,
  getNodeList,
} from "../ast-utils.js";
import type {
  CsharpObjectShapeSemanticsHost,
} from "../object-shape-types.js";
import {
  getSourceCoreStructMarkerDeclarationFromSubject,
  isSourceCoreStructMarkerCallExpression,
} from "../source-core-struct-markers.js";
import {
  getDeclarationTypeNode,
} from "../symbol-utils.js";
import {
  sourceDeclarationTargetType,
} from "./target-type.js";

export function getCsharpSourceStructDeclarationTargetForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
): { readonly targetType: TargetTypeRef; readonly objectShape: CsharpObjectShapeFact } | undefined {
  const declaration = getCsharpSourceStructMarkerDeclarationForSubject(subject, context);
  const sourceFile = declaration === undefined ? undefined : context.compiler?.ast.getSourceFile(declaration);
  return declaration === undefined || sourceFile === undefined
    ? undefined
    : getStructTargetForDeclaration(context, sourceFile, declaration, host);
}

function getStructTargetForDeclaration(
  context: ExtensionObservationContext,
  sourceFile: SourceFile,
  declaration: Node,
  host: CsharpObjectShapeSemanticsHost,
): { readonly targetType: TargetTypeRef; readonly objectShape: CsharpObjectShapeFact } | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const structFact = getStructFactForDeclaration(context, declaration);
  if (structFact?.valueType !== true) {
    return undefined;
  }
  const name = getDeclarationNameText(compiler.ast, declaration);
  const targetType = sourceDeclarationTargetType(name, "KindStructMarkerDeclaration");
  if (targetType === undefined) {
    return undefined;
  }
  const members = getStructObjectShapeMembers(context, sourceFile, structFact, host);
  if (members === undefined) {
    return undefined;
  }
  return {
    targetType,
    objectShape: {
      targetType,
      members,
      constructible: true,
    },
  };
}

function getStructObjectShapeMembers(
  context: ExtensionObservationContext,
  sourceFile: SourceFile,
  structFact: StructFact,
  host: CsharpObjectShapeSemanticsHost,
): readonly CsharpObjectShapeMemberFact[] | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const members = (structFact.fields ?? []).map((field): CsharpObjectShapeMemberFact | undefined => {
    const type = host.getTargetTypeRefForSubject(field.type, context, {
      allowRuntimeCarrier: false,
      allowSemanticTypeQuery: true,
      sourceFile,
    });
    return type === undefined
      ? undefined
      : {
          sourceName: field.name,
          targetName: field.name,
          memberKind: "property",
          type,
          ...(field.readonly === true ? { readonly: true as const } : {}),
        };
  });
  return members.some((member) => member === undefined)
    ? undefined
    : members as readonly CsharpObjectShapeMemberFact[];
}

function getCsharpSourceStructMarkerDeclarationForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): Node | undefined {
  const compiler = context.compiler;
  const node = asNodeSubject(subject);
  if (compiler === undefined || node === undefined) {
    return undefined;
  }
  if (compiler.ast.kindName(node) === "KindVariableDeclaration" && getStructFactForDeclaration(context, node)?.valueType === true) {
    return node;
  }
  if (compiler.ast.kindName(node) === "KindTypeAliasDeclaration") {
    const typeNode = asNodeSubject(getNodeField(node, "Type"));
    const declaration = typeNode === undefined
      ? undefined
      : getCsharpSourceStructMarkerDeclarationForSubject(typeNode, context);
    if (declaration !== undefined) {
      return declaration;
    }
  }
  const direct = getSourceCoreStructMarkerDeclarationFromSubject(subject, context);
  if (direct !== undefined) {
    return direct;
  }
  const declarationType = getDeclarationTypeNode(subject, context);
  if (declarationType !== undefined && declarationType !== node) {
    const declaration = getCsharpSourceStructMarkerDeclarationForSubject(declarationType, context);
    if (declaration !== undefined) {
      return declaration;
    }
  }
  return undefined;
}

function getStructFactForDeclaration(
  context: ExtensionObservationContext,
  declaration: Node,
): StructFact | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const direct = context.facts.get(declaration, structFactKey) ??
    context.factResolver.resolve(declaration, structFactKey);
  if (direct?.valueType === true) {
    return direct;
  }
  const initializer = asNodeSubject(getNodeField(declaration, "Initializer"));
  const callFact = initializer === undefined ? undefined : context.facts.get(initializer, structFactKey) ??
    context.factResolver.resolve(initializer, structFactKey);
  if (callFact?.valueType === true) {
    return callFact;
  }
  const symbol = getDeclarationSymbol(context, declaration);
  const symbolFact = symbol === undefined ? undefined : context.facts.get(symbol, structFactKey) ??
    context.factResolver.resolve(symbol, structFactKey);
  if (symbolFact?.valueType === true) {
    return symbolFact;
  }
  if (initializer === undefined ||
    compiler.ast.kindName(initializer) !== "KindCallExpression" ||
    !isSourceCoreStructMarkerCallExpression(initializer, context)) {
    return undefined;
  }
  return getStructFactFromFinalizedFieldFacts(context, initializer);
}

function getStructFactFromFinalizedFieldFacts(
  context: ExtensionObservationContext,
  callExpression: Node,
): StructFact | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const shape = getNodeList(getNodeField(callExpression, "Arguments"))[0];
  if (shape === undefined || compiler.ast.kindName(shape) !== "KindObjectLiteralExpression") {
    return undefined;
  }
  const fields: FieldFact[] = [];
  for (const property of getNodeList(getNodeField(shape, "Properties"))) {
    if (compiler.ast.kindName(property) !== "KindPropertyAssignment") {
      return undefined;
    }
    const initializer = asNodeSubject(getNodeField(property, "Initializer"));
    const field = context.facts.get(property, fieldFactKey) ??
      context.facts.get(initializer, fieldFactKey) ??
      context.factResolver.resolve(property, fieldFactKey) ??
      (initializer === undefined ? undefined : context.factResolver.resolve(initializer, fieldFactKey));
    if (field === undefined) {
      return undefined;
    }
    fields.push(field);
  }
  return {
    valueType: true,
    fields,
  };
}

function getDeclarationSymbol(
  context: ExtensionObservationContext,
  declaration: Node,
): ExtensionFactSubject | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const name = asNodeSubject(getNodeField(declaration, "name")) ?? compiler.ast.name(declaration);
  return name === undefined || compiler.ast.kindName(name) !== "KindIdentifier"
    ? undefined
    : compiler.checker.getSymbolAtLocation(name, { sourceFile: compiler.ast.getSourceFile(declaration) }) ??
      compiler.checker.getResolvedSymbol(name, { sourceFile: compiler.ast.getSourceFile(declaration) });
}

function getDeclarationNameText(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  declaration: Node,
): string {
  const name = asNodeSubject(getNodeField(declaration, "name")) ?? ast.name(declaration);
  return name === undefined ? getNodeNameText(declaration) : ast.text(name);
}
