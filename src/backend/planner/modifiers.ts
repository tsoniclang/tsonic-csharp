import {
  HasSyntacticModifier,
  ModifierFlagsAbstract,
  ModifierFlagsAccessor,
  ModifierFlagsAmbient,
  ModifierFlagsAsync,
  ModifierFlagsConst,
  ModifierFlagsOverride,
  ModifierFlagsPrivate,
  ModifierFlagsProtected,
  ModifierFlagsPublic,
  ModifierFlagsReadonly,
} from "./source-ast.js";
import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";

const typeScriptOnlyRuntimeShapeModifiers = [
  { flag: ModifierFlagsPublic, name: "public" },
  { flag: ModifierFlagsPrivate, name: "private" },
  { flag: ModifierFlagsProtected, name: "protected" },
  { flag: ModifierFlagsReadonly, name: "readonly" },
  { flag: ModifierFlagsAbstract, name: "abstract" },
  { flag: ModifierFlagsOverride, name: "override" },
  { flag: ModifierFlagsAmbient, name: "declare" },
  { flag: ModifierFlagsAccessor, name: "accessor" },
  { flag: ModifierFlagsConst, name: "const" },
] as const;

type TypeScriptOnlyRuntimeShapeModifierName =
  (typeof typeScriptOnlyRuntimeShapeModifiers)[number]["name"];

export function diagnoseTypeScriptOnlyRuntimeShapeModifiers(
  ast: AstReader,
  node: Node,
  context: string,
  diagnostics: TargetDiagnostic[],
  allowedModifiers: readonly TypeScriptOnlyRuntimeShapeModifierName[] = [],
): void {
  for (const modifier of typeScriptOnlyRuntimeShapeModifiers) {
    if (allowedModifiers.includes(modifier.name)) {
      continue;
    }
    if (HasSyntacticModifier(ast, node, modifier.flag)) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `TypeScript-only modifier '${modifier.name}' on ${context} is outside the native runtime-shape source subset. Use standard ECMAScript runtime shape or target/provider facts instead.`,
      ));
    }
  }
}

export function isAsyncNode(
  ast: AstReader,
  node: Node,
): boolean {
  return HasSyntacticModifier(ast, node, ModifierFlagsAsync);
}
