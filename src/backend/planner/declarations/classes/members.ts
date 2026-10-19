import type { CsharpPlanningContext } from "../../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpPropertyDeclaration,
  CsharpParameter,
  CsharpTypeMember,
} from "../../../target-ast/syntax/index.js";
import {
  KindClassStaticBlockDeclaration,
  KindConstructor,
  KindGetAccessor,
  KindMethodDeclaration,
  KindPropertyDeclaration,
  KindParameter,
  KindSetAccessor,
  SourceKind,
} from "@tsonic/target-api/source";
import { failCsharpPlannerInvariant } from "../../../invariants.js";
import { planConstructorDeclarations } from "./constructors.js";
import {
  planMethodDeclaration,
} from "./methods.js";
import {
  mergeAccessorProperty,
  planPropertyDeclaration,
} from "./properties.js";
import { planCsharpMutableMethod } from "./mutable-methods.js";
import { classFactoryContext } from "./factories.js";
import { planCsharpProjectCallableAdapters } from "./callable-adapters.js";
import type { CsharpClassInitializationRegion } from "./initializers.js";
import { completeLocalClassConstructor } from "./factories.js";

export interface CsharpPlannedClassMembers {
  readonly members: readonly CsharpTypeMember[];
  readonly constructorParameters: readonly CsharpParameter[] | undefined;
}

export function planClassMembers(
  members: readonly (Node | undefined)[],
  className: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  initialization: readonly CsharpClassInitializationRegion[],
): CsharpPlannedClassMembers {
  const planned: CsharpTypeMember[] = [];
  let constructorParameters: readonly CsharpParameter[] | undefined;
  const accessorProperties = new Map<string, CsharpPropertyDeclaration>();
  for (const member of members) {
    if (member === undefined) failCsharpPlannerInvariant("An admitted class requires its dense checked member declarations.");
    if (input.program.records.compileTimeMetadata.get(member) || input.program.records.memberModifiers.get(member)?.erased === true) {
      continue;
    }
    const owner = input.program.source.ast.parent(member);
    const factory = owner === undefined ? undefined : input.program.records.classFactory.get(owner);
    const memberInput = factory === undefined || input.program.source.ast.hasModifierKind(member, "static") ? input
      : classFactoryContext(factory, input.program.source.ast.is.IsConstructorDeclaration(member) || input.program.source.ast.is.IsPropertyDeclaration(member)
        ? { kind: "IdentifierName", name: factory.environmentName }
        : { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "this" }, name: factory.environmentName }, input, diagnostics, "instance");
    switch (SourceKind(input.program.source.ast, member)) {
      case KindConstructor:
        if (input.program.records.nativeParticipation.get(member) === "body") {
          const constructors = planConstructorDeclarations(member, className, sourceFile, memberInput, diagnostics,
            initialization[0]?.statements ?? []);
          const entry = input.program.records.constructorEntry.get(member);
          if (constructors[0] === undefined || entry === undefined) failCsharpPlannerInvariant("An admitted class constructor requires its native entry and parameters.", member);
          constructorParameters = constructors[0].parameters;
          planned.push(...constructors.map((constructor, index) => factory === undefined ? constructor
            : completeLocalClassConstructor(constructor, factory, input, [], entry.prepared && index === 0)));
        }
        break;
      case KindClassStaticBlockDeclaration:
        break;
      case KindMethodDeclaration: {
        const participation = input.program.records.nativeParticipation.get(member);
        if (participation === "body" || participation === "signature") {
          const write = input.program.records.methodWrite.get(member);
          const method = planMethodDeclaration(member, sourceFile, memberInput, diagnostics,
            { kind: "source", declaration: member, role: write === undefined ? "member" : "implementation" });
          planned.push(...(write === undefined ? [method] : planCsharpMutableMethod(member, method, write, input, diagnostics)));
          planned.push(...planCsharpProjectCallableAdapters(member, method, sourceFile, memberInput, diagnostics));
        }
        break;
      }
      case KindPropertyDeclaration:
      case KindParameter:
        planned.push(planPropertyDeclaration(member, sourceFile, input, diagnostics,
          initialization.map(region => region.inline.get(member)).find(value => value !== undefined)));
        break;
      case KindGetAccessor:
      case KindSetAccessor:
        mergeAccessorProperty(member, planned, accessorProperties, sourceFile, memberInput, diagnostics);
        break;
      default:
        return failCsharpPlannerInvariant("An admitted class member lost its native declaration form.", member);
    }
  }
  return { members: planned, constructorParameters };
}
