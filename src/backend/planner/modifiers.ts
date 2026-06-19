import {
  HasSyntacticModifier,
  ModifierFlagsAbstract,
  ModifierFlagsAccessor,
  ModifierFlagsAmbient,
  ModifierFlagsAsync,
  ModifierFlagsOverride,
  ModifierFlagsPrivate,
  ModifierFlagsProtected,
  ModifierFlagsPublic,
  ModifierFlagsReadonly,
} from "@tsonic/tsts";
import type { Node } from "@tsonic/tsts";
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
] as const;

export function diagnoseTypeScriptOnlyRuntimeShapeModifiers(
  node: Node,
  context: string,
  diagnostics: TargetDiagnostic[],
): void {
  for (const modifier of typeScriptOnlyRuntimeShapeModifiers) {
    if (HasSyntacticModifier(node, modifier.flag)) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `TypeScript-only modifier '${modifier.name}' on ${context} is outside the native runtime-shape source subset. Use standard ECMAScript runtime shape or target/provider facts instead.`,
      ));
    }
  }
}

export function diagnoseUnsupportedAsyncSemantics(
  node: Node,
  context: string,
  diagnostics: TargetDiagnostic[],
): void {
  if (!HasSyntacticModifier(node, ModifierFlagsAsync)) {
    return;
  }
  diagnostics.push(unsupportedNodeDiagnostic(
    node,
    `Async ${context} requires finalized TSTS/provider async lowering facts before C# emission.`,
  ));
}
