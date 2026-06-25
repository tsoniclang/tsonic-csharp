import {
  fieldFactKey,
  runtimeCarrierFactKey,
  structFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionEvidence,
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  SourceFile,
  StructFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpObjectShapeFactKey,
} from "../csharp-facts.js";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
} from "../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeNameText,
  getNodeList,
  visitAstReaderNodes,
} from "./ast-utils.js";
import {
  getDeclarationTypeNode,
} from "./symbol-utils.js";
import {
  getSourceCoreStructMarkerDeclarationFromSubject,
  isSourceCoreStructMarkerCallExpression,
} from "./source-core-struct-markers.js";
import {
  csharpTargetNamedType,
} from "./target-types.js";
import type {
  CsharpTargetNamedTypeRef,
} from "./target-types.js";
import type {
  CsharpObjectShapeSemanticsHost,
} from "./object-shape-types.js";

export function recordCsharpSourceDeclarationFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpObjectShapeSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      const context = createSourceDeclarationObservationContext(lifecycleContext, compiler);
      const structDeclaration = getCsharpSourceStructDeclarationTargetForSubject(node, context, host);
      if (structDeclaration !== undefined) {
        recordSourceDeclarationTarget(lifecycleContext, sourceFile, node, structDeclaration.targetType, structDeclaration.objectShape);
        return;
      }
      const declarationTarget = getSourceDeclarationTargetType(compiler.ast, node);
      if (declarationTarget !== undefined) {
        recordSourceDeclarationTarget(lifecycleContext, sourceFile, node, declarationTarget);
        return;
      }
      const enumMemberTarget = getEnumMemberTargetType(compiler.ast, node);
      if (enumMemberTarget !== undefined) {
        recordSourceDeclarationTarget(lifecycleContext, sourceFile, node, enumMemberTarget);
      }
    });
  }
}

function recordSourceDeclarationTarget(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  sourceFile: SourceFile,
  declaration: Node,
  targetType: TargetTypeRef,
  objectShape?: CsharpObjectShapeFact,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const fact = { carrier: targetType };
  const evidence: readonly ExtensionEvidence[] = [{ message: "C# source declaration runtime carrier recorded from TSTS source declaration identity." }];
  lifecycleContext.host.facts.set(declaration, runtimeCarrierFactKey, fact, evidence);
  if (objectShape !== undefined) {
    lifecycleContext.host.facts.set(declaration, csharpObjectShapeFactKey, objectShape, evidence);
  }
  const name = asNodeSubject(getNodeField(declaration, "name"));
  if (name !== undefined) {
    lifecycleContext.host.facts.set(name, runtimeCarrierFactKey, fact, evidence);
    if (objectShape !== undefined) {
      lifecycleContext.host.facts.set(name, csharpObjectShapeFactKey, objectShape, evidence);
    }
    const symbol = compiler.checker.getSymbolAtLocation(name, { sourceFile }) ??
      compiler.checker.getResolvedSymbol(name, { sourceFile });
    if (symbol !== undefined) {
      lifecycleContext.host.facts.set(symbol, runtimeCarrierFactKey, fact, evidence);
      if (objectShape !== undefined) {
        lifecycleContext.host.facts.set(symbol, csharpObjectShapeFactKey, objectShape, evidence);
      }
    }
    const type = isSourceDeclaredStructTargetType(targetType) ? undefined : compiler.checker.getTypeAtLocation(name, { sourceFile });
    if (type !== undefined) {
      lifecycleContext.host.facts.set(type, runtimeCarrierFactKey, fact, evidence);
      if (objectShape !== undefined) {
        lifecycleContext.host.facts.set(type, csharpObjectShapeFactKey, objectShape, evidence);
      }
      if (type.symbol !== undefined) {
        lifecycleContext.host.facts.set(type.symbol, runtimeCarrierFactKey, fact, evidence);
        if (objectShape !== undefined) {
          lifecycleContext.host.facts.set(type.symbol, csharpObjectShapeFactKey, objectShape, evidence);
        }
      }
    }
  }
}

function isSourceDeclaredStructTargetType(targetType: TargetTypeRef): boolean {
  return targetType.kind === "target-named" &&
    (targetType as { readonly csharpSourceDeclarationKind?: string }).csharpSourceDeclarationKind === "struct";
}

function createSourceDeclarationObservationContext(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  compiler: NonNullable<ExtensionObservationContext["compiler"]>,
): ExtensionObservationContext {
  return {
    observation: "type.resolveRuntimeCarrier",
    extensionId: "",
    host: lifecycleContext.host,
    facts: lifecycleContext.host.facts,
    factResolver: lifecycleContext.host.factResolver,
    diagnostics: lifecycleContext.host.diagnostics,
    compiler,
  };
}

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
  const direct = context.facts.get(declaration, structFactKey);
  if (direct?.valueType === true) {
    return direct;
  }
  const initializer = asNodeSubject(getNodeField(declaration, "Initializer"));
  const callFact = initializer === undefined ? undefined : context.facts.get(initializer, structFactKey);
  if (callFact?.valueType === true) {
    return callFact;
  }
  const symbol = getDeclarationSymbol(context, declaration);
  const symbolFact = context.facts.get(symbol, structFactKey);
  if (symbolFact?.valueType === true) {
    return symbolFact;
  }
  if (initializer === undefined ||
    compiler.ast.kindName(initializer) !== "KindCallExpression" ||
    !isSourceCoreStructMarkerCallExpression(initializer, context)) {
    return undefined;
  }
  return getStructFactFromCallShape(context, initializer);
}

function getStructFactFromCallShape(
  context: ExtensionObservationContext,
  callExpression: Node,
): StructFact | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const shape = getNodeList(getNodeField(callExpression, "Arguments"))[0];
  if (shape === undefined || compiler.ast.kindName(shape) !== "KindObjectLiteralExpression") {
    return { valueType: true, fields: [] };
  }
  const fields = getNodeList(getNodeField(shape, "Properties")).flatMap((property) => {
    if (compiler.ast.kindName(property) !== "KindPropertyAssignment") {
      return [];
    }
    const initializer = asNodeSubject(getNodeField(property, "Initializer"));
    const field = context.facts.get(property, fieldFactKey) ??
      context.facts.get(initializer, fieldFactKey) ??
      context.factResolver.resolve(property, fieldFactKey) ??
      (initializer === undefined ? undefined : context.factResolver.resolve(initializer, fieldFactKey));
    return field === undefined ? [] : [field];
  });
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

function getSourceDeclarationTargetType(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): TargetTypeRef | undefined {
  const kind = ast.kindName(node);
  if (kind !== "KindClassDeclaration" && kind !== "KindInterfaceDeclaration" && kind !== "KindEnumDeclaration") {
    return undefined;
  }
  return sourceDeclarationTargetType(getNodeNameText(node), kind);
}

function getEnumMemberTargetType(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): TargetTypeRef | undefined {
  if (ast.kindName(node) !== "KindEnumMember") {
    return undefined;
  }
  const enumDeclaration = ast.parent(node);
  return enumDeclaration === undefined || ast.kindName(enumDeclaration) !== "KindEnumDeclaration"
    ? undefined
    : sourceDeclarationTargetType(getNodeNameText(enumDeclaration), "KindEnumDeclaration");
}

export function sourceDeclarationTargetType(
  name: string,
  kind: "KindClassDeclaration" | "KindInterfaceDeclaration" | "KindEnumDeclaration" | "KindStructMarkerDeclaration",
  typeArguments?: readonly TargetTypeRef[],
): TargetTypeRef | undefined {
  if (name.length === 0) {
    return undefined;
  }
  const sourceDeclarationKind = kind === "KindClassDeclaration"
    ? "class" as const
    : kind === "KindInterfaceDeclaration"
      ? "interface" as const
    : kind === "KindEnumDeclaration"
      ? "enum" as const
      : "struct" as const;
  return {
    ...csharpTargetNamedType(name, typeArguments, { kind: "named", name }, {
      sourceDeclarationKind,
      ...(sourceDeclarationKind === "struct" ? { valueType: true as const } : {}),
    }),
  } as CsharpTargetNamedTypeRef;
}
