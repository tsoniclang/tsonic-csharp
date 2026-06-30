import {
  csharpTargetOperationFactKey,
} from "../../csharp-facts.js";
import type {
  ExtensionLifecycleContext,
  Node,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
} from "../ast-utils.js";
import {
  getOpaqueAnyOperation,
} from "./opaque-operation.js";
import {
  hardRejectedCompatOperation,
} from "./diagnostic-constants.js";
import type {
  UnsupportedCompatRuntimeOperation,
} from "./diagnostic-constants.js";
import {
  isClosedCompatRuntimeOperationFact,
} from "./closed-compat.js";
import {
  getUnsupportedStandardLibraryCompatOperation,
} from "./standard-library-exceptions.js";

export function getUnsupportedCompatRuntimeOperation(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host" | "compiler">,
): UnsupportedCompatRuntimeOperation | undefined {
  const sourceOperation = getUnsupportedSourceCompatRuntimeOperation(node, lifecycleContext);
  if (sourceOperation !== undefined) {
    return sourceOperation;
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

export function getUnsupportedSourceCompatRuntimeOperation(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "compiler">,
): UnsupportedCompatRuntimeOperation | undefined {
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
  return undefined;
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
