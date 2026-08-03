import type { CsharpTranslationContext } from "../../translate/context/index.js";
import type {
  CsharpModifier,
  CsharpMethodDeclaration,
  CsharpPropertyDeclaration,
} from "../roslyn/syntax.js";
import type { Node, SourceFile } from "@tsonic/tsts";

import {
  HasSourceKind,
  HasSyntacticModifier,
  KindPrivateIdentifier,
  ModifierFlagsStatic,
} from "./source-ast.js";
import {
  isAsyncNode,
} from "./modifiers.js";

export function planClassMemberModifiers(node: Node, name: Node | undefined, input: CsharpTranslationContext): readonly ("public" | "private" | "static")[] {
  const access = HasSourceKind(input.ast, name, KindPrivateIdentifier) ? "private" : "public";
  return HasSyntacticModifier(input.ast, node, ModifierFlagsStatic)
    ? [access, "static"]
    : [access];
}

export function planMethodModifiers(node: Node, name: Node | undefined, _sourceFile: SourceFile, input: CsharpTranslationContext): CsharpMethodDeclaration["modifiers"] {
  const modifiers: CsharpMethodDeclaration["modifiers"][number][] = [...planClassMemberModifiers(node, name, input)];
  addDispatchModifiers(modifiers, input.navigation.memberDispatch(node));
  if (isAsyncNode(input.ast, node)) {
    modifiers.push("async");
  }
  return modifiers;
}

export function planPropertyModifiers(node: Node, name: Node | undefined, _sourceFile: SourceFile, input: CsharpTranslationContext): CsharpPropertyDeclaration["modifiers"] {
  const modifiers: CsharpPropertyDeclaration["modifiers"][number][] = [...planClassMemberModifiers(node, name, input)];
  addDispatchModifiers(modifiers, input.navigation.memberDispatch(node));
  return modifiers;
}

function addDispatchModifiers(
  modifiers: CsharpModifier[],
  dispatch: ReturnType<CsharpTranslationContext["navigation"]["memberDispatch"]>,
): void {
  if (dispatch?.overridesBase === true) {
    modifiers.push("override");
  } else if (dispatch?.hasDerivedOverride === true) {
    modifiers.push("virtual");
  }
}
