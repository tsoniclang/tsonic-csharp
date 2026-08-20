import type { CsharpPlanningContext } from "../context.js";
import type {
  CsharpModifier,
  CsharpMethodDeclaration,
  CsharpPropertyDeclaration,
} from "../../target-ast/roslyn/index.js";
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
  const access = HasSourceKind(input.program.source.ast, name, KindPrivateIdentifier) ? "private" : "public";
  return HasSyntacticModifier(input.program.source.ast, node, ModifierFlagsStatic)
    ? [access, "static"]
    : [access];
}

export function planMethodModifiers(node: Node, name: Node | undefined, _sourceFile: SourceFile, input: CsharpPlanningContext): CsharpMethodDeclaration["modifiers"] {
  const modifiers: CsharpMethodDeclaration["modifiers"][number][] = [...planClassMemberModifiers(node, name, input)];
  addDispatchModifiers(modifiers, input.program.source.navigation.memberDispatch(node));
  if (isAsyncNode(input.program.source.ast, node)) {
    modifiers.push("async");
  }
  return modifiers;
}

export function planPropertyModifiers(node: Node, name: Node | undefined, _sourceFile: SourceFile, input: CsharpPlanningContext): CsharpPropertyDeclaration["modifiers"] {
  const modifiers: CsharpPropertyDeclaration["modifiers"][number][] = [...planClassMemberModifiers(node, name, input)];
  addDispatchModifiers(modifiers, input.program.source.navigation.memberDispatch(node));
  return modifiers;
}

function addDispatchModifiers(
  modifiers: CsharpModifier[],
  dispatch: ReturnType<CsharpPlanningContext["program"]["source"]["navigation"]["memberDispatch"]>,
): void {
  if (dispatch?.overridesBase === true) {
    modifiers.push("override");
  } else if (dispatch?.hasDerivedOverride === true) {
    modifiers.push("virtual");
  }
}
