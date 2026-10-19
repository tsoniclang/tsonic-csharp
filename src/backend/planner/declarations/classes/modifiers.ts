import type { CsharpPlanningContext } from "../../context.js";
import type {
  CsharpMethodDeclaration,
  CsharpPropertyDeclaration,
} from "../../../target-ast/syntax/index.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import type { CsharpNativeMemberIdentity } from "../../../../target-model/names/model.js";
import {
  planCsharpNativeMemberHiding,
} from "../modifiers.js";

export function planClassMemberModifiers(node: Node, name: Node | undefined, input: CsharpPlanningContext,
  subject: CsharpNativeMemberIdentity): readonly ("public" | "private" | "protected" | "internal" | "static" | "new")[] {
  const selected = input.program.records.memberModifiers.get(node);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted class member requires its native modifier selection.", node);
  const modifiers: ("public" | "private" | "protected" | "internal" | "static" | "new")[] = [...selected.member];
  if (name !== undefined) {
    modifiers.push(...planCsharpNativeMemberHiding(input.program.records.nativeMemberHiding, subject));
  }
  return modifiers;
}

export function planMethodModifiers(node: Node, name: Node | undefined, input: CsharpPlanningContext,
  subject: CsharpNativeMemberIdentity): CsharpMethodDeclaration["modifiers"] {
  const modifiers: CsharpMethodDeclaration["modifiers"][number][] = [...planClassMemberModifiers(node, name, input, subject)];
  const selected = input.program.records.memberModifiers.get(node)?.method;
  if (selected === undefined) failCsharpPlannerInvariant("An admitted method requires its native callable modifiers.", node);
  modifiers.push(...selected);
  return modifiers;
}

export function planPropertyModifiers(node: Node, name: Node | undefined, _sourceFile: SourceFile, input: CsharpPlanningContext): CsharpPropertyDeclaration["modifiers"] {
  const modifiers: CsharpPropertyDeclaration["modifiers"][number][] = [...planClassMemberModifiers(node, name, input,
    { kind: "source", declaration: node, role: "member" })];
  const selected = input.program.records.memberModifiers.get(node)?.property;
  if (selected === undefined) failCsharpPlannerInvariant("An admitted property requires its native callable modifiers.", node);
  modifiers.push(...selected);
  return modifiers;
}
