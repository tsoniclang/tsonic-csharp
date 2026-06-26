import type {
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
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

export function getSourceDeclarationTargetType(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const kind = ast.kindName(node);
  if (kind !== "KindClassDeclaration" && kind !== "KindInterfaceDeclaration" && kind !== "KindEnumDeclaration") {
    return undefined;
  }
  if (getSourceLibraryDeclarationName(node, context) !== undefined) {
    return undefined;
  }
  return sourceDeclarationTargetType(getNodeNameText(node), kind);
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

export function isSourceDeclaredStructTargetType(targetType: TargetTypeRef): boolean {
  return targetType.kind === "target-named" &&
    (targetType as { readonly csharpSourceDeclarationKind?: string }).csharpSourceDeclarationKind === "struct";
}
