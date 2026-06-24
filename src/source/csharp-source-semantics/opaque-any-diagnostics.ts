import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  TargetTypescriptCompatibilityMode,
} from "@tsonic/target-api";
import type {
  ExtensionLifecycleContext,
  Node,
} from "@tsonic/tsts";
import {
  csharpTargetOperationFactKey,
} from "../csharp-facts.js";
import {
  asNodeSubject,
  getAstReaderChildNodes,
  getNodeField,
} from "./ast-utils.js";
import {
  csharpProviderDiagnostic,
} from "./diagnostics.js";
import {
  getBinaryOperatorText,
} from "./operator-syntax.js";
import {
  isCsharpAnyRuntimeCarrier,
  isCsharpClosedCompatRuntimeCarrier,
} from "./target-types.js";
import type {
  CsharpTargetOperationFact,
} from "../csharp-facts.js";
import {
  isTstsBundledStandardLibraryFile,
} from "./source-library.js";

const unsupportedAnyOperationCode = "CSHARP_ANY_DYNAMIC_OPERATION_UNSUPPORTED";
const unsupportedAnyOperationNumericCode = 9100121;
const unsupportedCompatRuntimeOperationCode = "CSHARP_COMPAT_RUNTIME_OPERATION_UNSUPPORTED";
const unsupportedCompatRuntimeOperationNumericCode = 9100128;

export function diagnoseOpaqueAnyOperationsBeforeFinalization(
  lifecycleContext: Pick<ExtensionLifecycleContext, "extensionId" | "host" | "compiler">,
  compatibilityMode: TargetTypescriptCompatibilityMode,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    diagnoseOpaqueAnyOperationsForNode(sourceFile, lifecycleContext, compatibilityMode);
  }
}

function diagnoseOpaqueAnyOperationsForNode(
  node: Node | undefined,
  lifecycleContext: Pick<ExtensionLifecycleContext, "extensionId" | "host" | "compiler">,
  compatibilityMode: TargetTypescriptCompatibilityMode,
): void {
  const compiler = lifecycleContext.compiler;
  if (node === undefined || compiler === undefined) {
    return;
  }
  for (const child of getAstReaderChildNodes(compiler.ast, node)) {
    diagnoseOpaqueAnyOperationsForNode(child, lifecycleContext, compatibilityMode);
  }
  const unsupportedCompatOperation = getUnsupportedCompatRuntimeOperation(node, lifecycleContext);
  if (unsupportedCompatOperation !== undefined) {
    lifecycleContext.host.diagnostics.append({
      ...csharpProviderDiagnostic(
        lifecycleContext.extensionId,
        unsupportedCompatRuntimeOperationCode,
        unsupportedCompatRuntimeOperationNumericCode,
        unsupportedCompatOperation.message,
      ),
      nodeOrSpan: node,
      evidence: [
        {
          message: "C# compat-runtime boundary rejected",
          details: unsupportedCompatOperation.reason,
        },
        {
          message: "Required architecture",
          details: unsupportedCompatOperation.architecture,
        },
      ],
      identity: `csharp-compat-runtime-operation:${unsupportedCompatOperation.kind}:${subjectIdentity(node)}`,
    });
  }
  const operation = getOpaqueAnyOperation(node, lifecycleContext);
  if (operation === undefined) {
    return;
  }
  if (compatibilityMode === "compat" && hasClosedCompatRuntimeOperation(node, lifecycleContext)) {
    return;
  }
  const modeDetails = compatibilityMode === "strict-native"
    ? {
        message: `${operation.description} uses TypeScript any in strict-native mode.`,
        reason: "Strict-native mode hard-rejects dynamic TypeScript any operations even if a compatibility surface has produced target operation facts.",
        architecture: "Select typescriptCompatibility: \"compat\" and provide closed TsValue/TsObject/TsFunction operation facts to enable dynamic behavior.",
      }
    : {
        message: `${operation.description} uses TypeScript any in compatibility mode without finalized target operation facts.`,
        reason: "Compatibility mode is selected, but no closed dynamic runtime operation fact exists for this expression.",
        architecture: "A selected compatibility surface must provide an explicit TsValue/TsObject/TsFunction operation fact; backend emission must not infer dynamic behavior from TypeScript any.",
      };
  lifecycleContext.host.diagnostics.append({
    ...csharpProviderDiagnostic(
      lifecycleContext.extensionId,
      unsupportedAnyOperationCode,
      unsupportedAnyOperationNumericCode,
      modeDetails.message,
    ),
    nodeOrSpan: node,
    evidence: [
      {
        message: "C# dynamic boundary rejected",
        details: modeDetails.reason,
      },
      {
        message: "Required architecture",
        details: modeDetails.architecture,
      },
    ],
    identity: `csharp-any-operation:${compatibilityMode}:${operation.kind}:${subjectIdentity(node)}`,
  });
}

function getOpaqueAnyOperation(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
): { readonly kind: string; readonly description: string } | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const ast = compiler.ast;
  if (ast.is.IsCallExpression(node)) {
    return hasOpaqueAnyCarrier(asNodeSubject(getNodeField(node, "Expression")), lifecycleContext)
      ? { kind: "call", description: "C# call emission" }
      : undefined;
  }
  if (ast.is.IsNewExpression(node)) {
    return hasOpaqueAnyCarrier(asNodeSubject(getNodeField(node, "Expression")), lifecycleContext)
      ? { kind: "construct", description: "C# construct emission" }
      : undefined;
  }
  if (ast.is.IsPropertyAccessExpression(node)) {
    return hasOpaqueAnyCarrier(asNodeSubject(getNodeField(node, "Expression")), lifecycleContext)
      ? { kind: "property", description: "C# property access emission" }
      : undefined;
  }
  if (ast.is.IsElementAccessExpression(node)) {
    return hasOpaqueAnyCarrier(asNodeSubject(getNodeField(node, "Expression")), lifecycleContext)
      ? { kind: "element", description: "C# element access emission" }
      : undefined;
  }
  if (ast.is.IsBinaryExpression(node)) {
    const operator = getBinaryOperatorText(ast, node);
    if (operator === "=") {
      return undefined;
    }
    return hasOpaqueAnyCarrier(asNodeSubject(getNodeField(node, "Left")), lifecycleContext) ||
      hasOpaqueAnyCarrier(asNodeSubject(getNodeField(node, "Right")), lifecycleContext)
      ? { kind: "operator", description: `C# '${operator}' operator emission` }
      : undefined;
  }
  return undefined;
}

function getUnsupportedCompatRuntimeOperation(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
): { readonly kind: string; readonly message: string; readonly reason: string; readonly architecture: string } | undefined {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const ast = compiler.ast;
  if (ast.kindName(node) === "KindWithStatement") {
    return hardRejectedCompatOperation(
      "with-statement",
      "C# emission cannot support JavaScript 'with' dynamic scope.",
      "'with' changes lexical name lookup through dynamic scope at runtime; no closed Tsonic-owned carrier can make those bindings statically visible to the C# backend.",
    );
  }
  if (ast.kindName(node) === "KindPropertyAssignment" && getNodeNameText(ast, node) === "__proto__") {
    return hardRejectedCompatOperation(
      "proto-object-literal",
      "C# emission cannot support object-literal __proto__ prototype mutation.",
      "An object-literal __proto__ member changes the created object's prototype; Tsonic has no closed target object-shape mutation carrier for this operation.",
    );
  }
  const libraryOperation = getUnsupportedStandardLibraryCompatOperation(node, lifecycleContext);
  if (libraryOperation !== undefined) {
    return libraryOperation;
  }
  const operation = lifecycleContext.host.facts.get(node, csharpTargetOperationFactKey);
  if (isClosedCompatRuntimeOperationFact(operation) && getOpaqueAnyOperation(node, lifecycleContext) === undefined) {
    return hardRejectedCompatOperation(
      "non-any-compat-carrier",
      "C# compat-runtime carrier operation facts can only attach to explicit TypeScript any operations.",
      "The finalized operation fact targets a closed TsValue/TsObject/TsArray/TsFunction-style carrier, but the source expression was not proven to operate on a TypeScript any runtime carrier. unknown, object, and statically typed values must not become dynamic through target facts.",
    );
  }
  return undefined;
}

function getUnsupportedStandardLibraryCompatOperation(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "compiler">,
): { readonly kind: string; readonly message: string; readonly reason: string; readonly architecture: string } | undefined {
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
  if (selected.name === "eval") {
    return hardRejectedCompatOperation(
      "eval",
      "C# emission cannot support JavaScript eval.",
      "eval executes source text with runtime lexical scope access. No closed target carrier can make those bindings statically visible to the C# backend.",
    );
  }
  if (selected.name === "Function" || selected.containerName === "FunctionConstructor") {
    return hardRejectedCompatOperation(
      "function-constructor",
      "C# emission cannot support JavaScript dynamic Function construction.",
      "Function construction compiles source text at runtime. Tsonic does not use embedded JavaScript engines, C# dynamic, or runtime code generation as language semantics.",
    );
  }
  if (selected.name === "Proxy" || selected.containerName === "ProxyConstructor") {
    return hardRejectedCompatOperation(
      "proxy",
      "C# emission cannot support JavaScript Proxy.",
      "Proxy traps redefine object operations at runtime. Tsonic requires closed provider facts for every emitted operation and cannot dispatch through runtime target reflection or dynamic traps.",
    );
  }
  if (
    selected.containerName === "ObjectConstructor" &&
    (selected.name === "setPrototypeOf" || selected.name === "getPrototypeOf" || selected.name === "create")
  ) {
    return hardRejectedCompatOperation(
      `object-${selected.name}`,
      `C# emission cannot support JavaScript Object.${selected.name} prototype semantics.`,
      "Prototype mutation and prototype-chain creation change object member lookup dynamically. Tsonic requires explicit closed object-shape/provider facts and cannot synthesize prototype semantics from standard JavaScript declarations.",
    );
  }
  return undefined;
}

interface StandardLibraryDeclarationSelection {
  readonly name: string;
  readonly containerName?: string;
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
  const symbol = compiler.checker.getResolvedSymbol(node, { sourceFile }) ??
    compiler.checker.getSymbolAtLocation(node, { sourceFile });
  const declarations = (symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations ?? [];
  for (const declaration of declarations) {
    const selected = getStandardLibraryDeclarationSelection(declaration, compiler.ast);
    if (selected !== undefined) {
      return selected;
    }
  }
  return undefined;
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

function hardRejectedCompatOperation(
  kind: string,
  message: string,
  reason: string,
): { readonly kind: string; readonly message: string; readonly reason: string; readonly architecture: string } {
  return {
    kind,
    message,
    reason,
    architecture: "This pattern is classified as hard-reject until an explicit closed Tsonic-owned compat-runtime carrier and finalized target operation fact exists; the backend must not use QuickJS, CLR reflection dispatch, C# dynamic, or source-name guessing.",
  };
}

function getNodeNameText(
  ast: NonNullable<ExtensionLifecycleContext["compiler"]>["ast"],
  node: Node,
): string | undefined {
  const name = ast.name(node) ?? asNodeSubject(getNodeField(node, "Name")) ?? asNodeSubject(getNodeField(node, "name"));
  if (name === undefined) {
    return undefined;
  }
  const kind = ast.kindName(name);
  return kind === "KindIdentifier" || kind === "KindStringLiteral" || kind === "KindNoSubstitutionTemplateLiteral"
    ? ast.text(name)
    : undefined;
}

function hasClosedCompatRuntimeOperation(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host">,
): boolean {
  return isClosedCompatRuntimeOperationFact(lifecycleContext.host.facts.get(node, csharpTargetOperationFactKey));
}

function isClosedCompatRuntimeOperationFact(operation: CsharpTargetOperationFact | undefined): boolean {
  return operation?.kind === "member" &&
    (
      isCsharpClosedCompatRuntimeCarrier(operation.declaringType) ||
      isCsharpClosedCompatRuntimeCarrier(operation.resultType)
    );
}

function hasOpaqueAnyCarrier(
  subject: Node | undefined,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host">,
): boolean {
  if (subject === undefined) {
    return false;
  }
  return isCsharpAnyRuntimeCarrier(lifecycleContext.host.factResolver.resolve(subject, runtimeCarrierFactKey)?.carrier);
}

function subjectIdentity(subject: unknown): string {
  if (subject !== null && typeof subject === "object") {
    const loc = (subject as { readonly Loc?: { readonly pos?: unknown; readonly end?: unknown } }).Loc;
    if (typeof loc?.pos === "number" && typeof loc.end === "number") {
      return `${loc.pos}:${loc.end}`;
    }
  }
  return "unknown";
}
