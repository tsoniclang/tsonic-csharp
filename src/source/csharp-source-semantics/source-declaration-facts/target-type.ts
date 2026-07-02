import type {
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  getNodeNameText,
} from "../ast-utils.js";
import {
  getSourceLibraryDeclarationName,
} from "../source-library.js";
import {
  csharpTargetNamedType,
} from "../target-types.js";
import type {
  CsharpTargetNamedTypeRef,
} from "../target-types.js";
import type {
  CsharpObjectShapeSemanticsHost,
} from "../object-shape-types.js";

export function getSourceDeclarationTargetType(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
  context: ExtensionObservationContext,
  host?: CsharpObjectShapeSemanticsHost,
): TargetTypeRef | undefined {
  const kind = ast.kindName(node);
  if (kind !== "KindClassDeclaration" && kind !== "KindInterfaceDeclaration" && kind !== "KindEnumDeclaration") {
    return undefined;
  }
  if (getSourceLibraryDeclarationName(node, context) !== undefined) {
    return undefined;
  }
  return sourceDeclarationTargetType(getNodeNameText(node), kind, undefined, {
    baseType: kind === "KindClassDeclaration" && host !== undefined
      ? getSourceClassBaseTargetType(ast, node, context, host)
      : undefined,
  });
}

export function getEnumMemberTargetType(
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
  metadata: {
    readonly baseType?: TargetTypeRef;
  } = {},
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
      ...(metadata.baseType !== undefined ? { baseType: metadata.baseType } : {}),
      ...(sourceDeclarationKind === "struct" ? { valueType: true as const } : {}),
    }),
  } as CsharpTargetNamedTypeRef;
}

function getSourceClassBaseTargetType(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
): TargetTypeRef | undefined {
  const heritage = ast.extendsHeritageElements(node)[0];
  if (heritage === undefined) {
    return undefined;
  }
  const expression = asNodeSubject(getNodeField(heritage, "Expression")) ??
    asNodeSubject(getNodeField(heritage, "expression")) ??
    heritage;
  const direct = host.getTargetTypeRefForSubject(expression, context, { allowRuntimeCarrier: true });
  if (direct !== undefined) {
    return direct;
  }
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  let type: Type | undefined;
  try {
    type = compiler.checker.getTypeAtLocation(expression, { sourceFile: ast.getSourceFile(expression) });
  } catch {
    return undefined;
  }
  return host.getTargetTypeRefForType(type, context, { allowRuntimeCarrier: true });
}

export function isSourceDeclaredStructTargetType(targetType: TargetTypeRef): boolean {
  return targetType.kind === "target-named" &&
    (targetType as { readonly csharpSourceDeclarationKind?: string }).csharpSourceDeclarationKind === "struct";
}
