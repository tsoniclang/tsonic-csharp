import type {
  CsharpCompilationUnit,
  CsharpMember,
} from "../roslyn/syntax.js";
import {
  memberRequiresUnsafe,
} from "./unsafe-members.js";

export function compilationUnitRequiresUnsafe(unit: CsharpCompilationUnit): boolean {
  return unit.members.some(memberRequiresUnsafe);
}

export type {
  CsharpMember,
};
