import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpPropertyDeclaration,
  CsharpTypeMember,
} from "../roslyn/syntax.js";
import {
  KindClassStaticBlockDeclaration,
  KindConstructor,
  KindGetAccessor,
  KindMethodDeclaration,
  KindPropertyDeclaration,
  KindSetAccessor,
  SourceKind,
} from "./source-ast.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  planClassStaticBlockDeclaration,
  planConstructorDeclaration,
} from "./declaration-class-constructors.js";
import {
  planMethodDeclaration,
} from "./declaration-class-methods.js";
import {
  mergeAccessorProperty,
  planPropertyDeclaration,
} from "./declaration-class-properties.js";

export function planClassMembers(
  members: readonly (Node | undefined)[],
  className: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeMember[] {
  const planned: CsharpTypeMember[] = [];
  const accessorProperties = new Map<string, CsharpPropertyDeclaration>();
  for (const member of members) {
    if (member === undefined) {
      continue;
    }
    switch (SourceKind(input.ast, member)) {
      case KindConstructor:
        planned.push(planConstructorDeclaration(member, className, sourceFile, input, diagnostics));
        break;
      case KindClassStaticBlockDeclaration:
        planned.push(planClassStaticBlockDeclaration(member, className, sourceFile, input, diagnostics));
        break;
      case KindMethodDeclaration:
        planned.push(planMethodDeclaration(member, sourceFile, input, diagnostics));
        break;
      case KindPropertyDeclaration:
        planned.push(planPropertyDeclaration(member, sourceFile, input, diagnostics));
        break;
      case KindGetAccessor:
      case KindSetAccessor:
        mergeAccessorProperty(member, planned, accessorProperties, sourceFile, input, diagnostics);
        break;
      default:
        diagnostics.push(unsupportedNodeDiagnostic(member, "Class member is outside the current C# planning surface."));
        break;
    }
  }
  return planned;
}
