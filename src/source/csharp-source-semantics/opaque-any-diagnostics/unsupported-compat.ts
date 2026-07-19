import type {
  ExtensionLifecycleContext,
  Node,
} from "@tsonic/tsts";
import {
  asNodeSubject,
} from "../ast-utils.js";
import {
  hardRejectedCompatOperation,
} from "./diagnostic-constants.js";
import type {
  UnsupportedCompatRuntimeOperation,
} from "./diagnostic-constants.js";
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
  return undefined;
}

function getNodeNameText(
  ast: NonNullable<ExtensionLifecycleContext["compiler"]>["ast"],
  node: Node,
): string | undefined {
  const name = asNodeSubject(ast.name(node));
  if (name === undefined) {
    return undefined;
  }
  const kind = ast.kindName(name);
  return kind === "KindIdentifier" || kind === "KindStringLiteral" || kind === "KindNoSubstitutionTemplateLiteral"
    ? ast.text(name)
    : undefined;
}
