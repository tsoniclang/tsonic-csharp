import type {
  CsharpCompilationUnit,
} from "../../target-ast/roslyn/index.js";
import {
  memberRequiresUnsafePermission,
} from "./unsafe-members.js";

export function compilationUnitRequiresUnsafe(
  unit: CsharpCompilationUnit,
): boolean {
  return unit.members.some(memberRequiresUnsafePermission);
}
