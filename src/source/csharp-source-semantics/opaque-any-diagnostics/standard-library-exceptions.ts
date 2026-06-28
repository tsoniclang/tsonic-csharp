import type {
  ExtensionLifecycleContext,
  Node,
  SourceFile,
  Symbol,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
} from "../ast-utils.js";
import {
  isTstsBundledStandardLibraryFile,
} from "../source-library.js";
import {
  hardRejectedCompatOperation,
} from "./diagnostic-constants.js";
import type {
  UnsupportedCompatRuntimeOperation,
} from "./diagnostic-constants.js";

interface StandardLibraryDeclarationSelection {
  readonly name: string;
  readonly containerName?: string;
}

interface UnsupportedStandardLibraryException {
  readonly kind: string;
  readonly match?: "all" | "any";
  readonly names?: readonly string[];
  readonly containerNames?: readonly string[];
  readonly message: (selection: StandardLibraryDeclarationSelection) => string;
  readonly reason: (selection: StandardLibraryDeclarationSelection) => string;
}

const unsupportedStandardLibraryExceptions: readonly UnsupportedStandardLibraryException[] = [
  {
    kind: "eval",
    names: ["eval"],
    message: () => "C# emission cannot support JavaScript eval.",
    reason: () => "eval executes source text with runtime lexical scope access. No closed target carrier can make those bindings statically visible to the C# backend.",
  },
  {
    kind: "function-constructor",
    match: "any",
    names: ["Function"],
    containerNames: ["FunctionConstructor"],
    message: () => "C# emission cannot support JavaScript dynamic Function construction.",
    reason: () => "Function construction compiles source text at runtime. Tsonic does not use embedded JavaScript engines, C# dynamic, or runtime code generation as language semantics.",
  },
  {
    kind: "proxy",
    match: "any",
    names: ["Proxy"],
    containerNames: ["ProxyConstructor"],
    message: () => "C# emission cannot support JavaScript Proxy.",
    reason: () => "Proxy traps redefine object operations at runtime. Tsonic requires closed provider facts for every emitted operation and cannot dispatch through runtime target reflection or dynamic traps.",
  },
  {
    kind: "object-prototype",
    names: ["setPrototypeOf", "getPrototypeOf", "create"],
    containerNames: ["ObjectConstructor"],
    message: (selection) => `C# emission cannot support JavaScript Object.${selection.name} prototype semantics.`,
    reason: () => "Prototype mutation and prototype-chain creation change object member lookup dynamically. Tsonic requires explicit closed object-shape/provider facts and cannot synthesize prototype semantics from standard JavaScript declarations.",
  },
];

export function getUnsupportedStandardLibraryCompatOperation(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "compiler">,
): UnsupportedCompatRuntimeOperation | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const ast = compiler.ast;
  const callee = ast.is.IsCallExpression(node) || ast.is.IsNewExpression(node)
    ? asNodeSubject(getNodeField(node, "Expression"))
    : undefined;
  if (callee === undefined) {
    return undefined;
  }
  const selected = getSelectedStandardLibraryDeclaration(callee, lifecycleContext);
  if (selected === undefined) {
    return undefined;
  }
  const exception = unsupportedStandardLibraryExceptions.find((candidate) =>
    exceptionMatchesStandardLibrarySelection(candidate, selected)
  );
  return exception === undefined
    ? undefined
    : hardRejectedCompatOperation(
        exception.kind === "object-prototype" ? `object-${selected.name}` : exception.kind,
        exception.message(selected),
        exception.reason(selected),
      );
}

function exceptionMatchesStandardLibrarySelection(
  exception: UnsupportedStandardLibraryException,
  selection: StandardLibraryDeclarationSelection,
): boolean {
  const nameMatches = exception.names?.includes(selection.name) ?? false;
  const containerMatches = selection.containerName === undefined
    ? false
    : exception.containerNames?.includes(selection.containerName) ?? false;
  if (exception.match === "any") {
    return nameMatches || containerMatches;
  }
  return (exception.names === undefined || nameMatches) &&
    (exception.containerNames === undefined || containerMatches);
}

function getSelectedStandardLibraryDeclaration(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "compiler">,
): StandardLibraryDeclarationSelection | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const kind = compiler.ast.kindName(node);
  if (kind !== "KindIdentifier" && kind !== "KindPropertyAccessExpression") {
    return undefined;
  }
  const sourceFile = compiler.ast.getSourceFile(node);
  const symbol = safeGetResolvedSymbol(node, sourceFile, compiler.checker) ??
    compiler.checker.getSymbolAtLocation(node, { sourceFile });
  const declarations = compiler.checker.getSymbolDeclarations(symbol as Symbol);
  for (const declaration of declarations) {
    if (declaration === undefined) {
      continue;
    }
    const selected = getStandardLibraryDeclarationSelection(declaration, compiler.ast);
    if (selected !== undefined) {
      return selected;
    }
  }
  return undefined;
}

function safeGetResolvedSymbol(
  node: Node,
  sourceFile: SourceFile | undefined,
  checker: NonNullable<ExtensionLifecycleContext["compiler"]>["checker"],
): ReturnType<NonNullable<ExtensionLifecycleContext["compiler"]>["checker"]["getResolvedSymbol"]> | undefined {
  try {
    return checker.getResolvedSymbol(node, { sourceFile });
  } catch {
    return undefined;
  }
}

function getStandardLibraryDeclarationSelection(
  declaration: Node,
  ast: NonNullable<ExtensionLifecycleContext["compiler"]>["ast"],
): StandardLibraryDeclarationSelection | undefined {
  const sourceFile = ast.getSourceFile(declaration);
  if (!isTstsBundledStandardLibraryFile(ast.getFileName(sourceFile))) {
    return undefined;
  }
  const name = ast.text(ast.name(declaration));
  if (name === "") {
    return undefined;
  }
  const parentName = ast.text(ast.name(ast.parent(declaration)));
  return {
    name,
    ...(parentName === "" ? {} : { containerName: parentName }),
  };
}
