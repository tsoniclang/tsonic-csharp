import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpPropertyDeclaration,
  CsharpTypeMember,
} from "../../target-ast/roslyn/index.js";
import {
  AsConstructorDeclaration,
  AsMethodDeclaration,
  KindClassStaticBlockDeclaration,
  KindConstructor,
  KindGetAccessor,
  KindMethodDeclaration,
  KindPropertyDeclaration,
  KindSetAccessor,
  SourceKind,
  sourceClassFieldIsTypeOnly,
} from "@tsonic/target-api/source";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
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
import { planCsharpMutableMethod } from "./mutable-methods.js";

export function planClassMembers(
  members: readonly (Node | undefined)[],
  className: string,
  autoPropertyNames: ReadonlySet<string>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeMember[] {
  const planned: CsharpTypeMember[] = [];
  const accessorProperties = new Map<string, CsharpPropertyDeclaration>();
  for (const member of members) {
    if (member === undefined || sourceClassFieldIsTypeOnly(input.program.source.ast, member)) {
      continue;
    }
    switch (SourceKind(input.program.source.ast, member)) {
      case KindConstructor:
        if (AsConstructorDeclaration(input.program.source.ast, member)?.Body !== undefined) {
          planned.push(planConstructorDeclaration(member, className, sourceFile, input, diagnostics));
        }
        break;
      case KindClassStaticBlockDeclaration:
        planned.push(planClassStaticBlockDeclaration(member, className, sourceFile, input, diagnostics));
        break;
      case KindMethodDeclaration:
        if (AsMethodDeclaration(input.program.source.ast, member)?.Body !== undefined) {
          const method = planMethodDeclaration(member, sourceFile, input, diagnostics);
          const write = input.program.declarations.methodWrite(member);
          planned.push(...(write === undefined ? [method] : planCsharpMutableMethod(member, method, write, input, diagnostics)));
        }
        break;
      case KindPropertyDeclaration:
        planned.push(planPropertyDeclaration(member, autoPropertyNames, sourceFile, input, diagnostics));
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
