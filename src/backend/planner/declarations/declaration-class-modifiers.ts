import type { CsharpPlanningContext } from "../context.js";
import type {
  CsharpModifier,
  CsharpMethodDeclaration,
  CsharpPropertyDeclaration,
} from "../../roslyn/syntax.js";
import type { Node, SourceFile } from "@tsonic/tsts";

import {
  HasSourceKind,
  HasSyntacticModifier,
  KindPrivateIdentifier,
  ModifierFlagsStatic,
} from "@tsonic/target-api/source";
import {
  isAsyncNode,
} from "./modifiers.js";

export function planClassMemberModifiers(node: Node, name: Node | undefined, input: CsharpPlanningContext): readonly ("public" | "private" | "static")[] {
  const access = HasSourceKind(input.ast, name, KindPrivateIdentifier) ? "private" : "public";
  return HasSyntacticModifier(input.ast, node, ModifierFlagsStatic)
    ? [access, "static"]
    : [access];
}

export function planMethodModifiers(node: Node, name: Node | undefined, _sourceFile: SourceFile, input: CsharpPlanningContext): CsharpMethodDeclaration["modifiers"] {
  const modifiers: CsharpMethodDeclaration["modifiers"][number][] = [...planClassMemberModifiers(node, name, input)];
  addDispatchModifiers(modifiers, input.navigation.memberDispatch(node));
  if (isAsyncNode(input.ast, node)) {
    modifiers.push("async");
  }
  return modifiers;
}

export function planPropertyModifiers(node: Node, name: Node | undefined, _sourceFile: SourceFile, input: CsharpPlanningContext): CsharpPropertyDeclaration["modifiers"] {
  const modifiers: CsharpPropertyDeclaration["modifiers"][number][] = [...planClassMemberModifiers(node, name, input)];
  addDispatchModifiers(modifiers, input.navigation.memberDispatch(node));
  return modifiers;
}

function addDispatchModifiers(
  modifiers: CsharpModifier[],
  dispatch: ReturnType<CsharpPlanningContext["navigation"]["memberDispatch"]>,
): void {
  if (dispatch?.overridesBase === true) {
    modifiers.push("override");
  } else if (dispatch?.hasDerivedOverride === true) {
    modifiers.push("virtual");
  }
}
