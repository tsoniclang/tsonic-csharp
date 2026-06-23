import type {
  CsharpMethodDeclaration,
} from "../roslyn/syntax.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import {
  HasSourceKind,
  HasSyntacticModifier,
  KindPrivateIdentifier,
  ModifierFlagsStatic,
} from "./source-ast.js";
import {
  isAsyncNode,
} from "./modifiers.js";

export function planClassMemberModifiers(node: Node, name: Node | undefined, input: TargetCompileInput): readonly ("public" | "private" | "static")[] {
  const access = HasSourceKind(input.ast, name, KindPrivateIdentifier) ? "private" : "public";
  return HasSyntacticModifier(node, ModifierFlagsStatic)
    ? [access, "static"]
    : [access];
}

export function planMethodModifiers(node: Node, name: Node | undefined, sourceFile: SourceFile, input: TargetCompileInput): CsharpMethodDeclaration["modifiers"] {
  const modifiers: CsharpMethodDeclaration["modifiers"][number][] = [...planClassMemberModifiers(node, name, input)];
  const dispatch = input.semantics.getProjectSourceMethodDispatch(node, { sourceFile });
  if (dispatch?.overridesBase === true) {
    modifiers.push("override");
  } else if (dispatch?.hasDerivedOverride === true) {
    modifiers.push("virtual");
  }
  if (isAsyncNode(node)) {
    modifiers.push("async");
  }
  return modifiers;
}
