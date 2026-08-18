import type {
  CsharpCompilationUnit,
} from "../../roslyn/syntax.js";
import {
  memberRequiresUnsafePermission,
} from "./unsafe-members.js";

export function compilationUnitRequiresUnsafe(
  unit: CsharpCompilationUnit,
): boolean {
  return unit.members.some(memberRequiresUnsafePermission);
}
