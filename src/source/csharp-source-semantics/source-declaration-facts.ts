import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionEvidence,
  ExtensionObservationContext,
  Node,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  getNodeNameText,
  visitStructuralNodes,
} from "./ast-utils.js";
import {
  csharpTargetNamedType,
} from "./target-types.js";
import type {
  CsharpTargetNamedTypeRef,
} from "./target-types.js";

export function recordCsharpSourceDeclarationFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitStructuralNodes(sourceFile, (node) => {
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
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const fact = { carrier: targetType };
  const evidence: readonly ExtensionEvidence[] = [{ message: "C# source declaration runtime carrier recorded from TSTS source declaration identity." }];
  lifecycleContext.host.facts.set(declaration, runtimeCarrierFactKey, fact, evidence);
  const name = asNodeSubject(getNodeField(declaration, "name"));
  if (name !== undefined) {
    lifecycleContext.host.facts.set(name, runtimeCarrierFactKey, fact, evidence);
    const symbol = compiler.checker.getSymbolAtLocation(name, { sourceFile }) ??
      compiler.checker.getResolvedSymbol(name, { sourceFile });
    if (symbol !== undefined) {
      lifecycleContext.host.facts.set(symbol, runtimeCarrierFactKey, fact, evidence);
    }
    const type = compiler.checker.getTypeAtLocation(name, { sourceFile });
    if (type !== undefined) {
      lifecycleContext.host.facts.set(type, runtimeCarrierFactKey, fact, evidence);
      if (type.symbol !== undefined) {
        lifecycleContext.host.facts.set(type.symbol, runtimeCarrierFactKey, fact, evidence);
      }
    }
  }
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
  kind: "KindClassDeclaration" | "KindInterfaceDeclaration" | "KindEnumDeclaration",
  typeArguments?: readonly TargetTypeRef[],
): TargetTypeRef | undefined {
  if (name.length === 0) {
    return undefined;
  }
  return {
    ...csharpTargetNamedType(name, typeArguments, { kind: "named", name }),
    csharpSourceDeclarationKind: kind === "KindClassDeclaration"
      ? "class" as const
      : kind === "KindInterfaceDeclaration"
        ? "interface" as const
        : "enum" as const,
  } as CsharpTargetNamedTypeRef;
}
