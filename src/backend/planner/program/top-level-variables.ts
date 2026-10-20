import type { CsharpPlanningContext } from "../context.js";
import {
  AsVariableDeclaration,
  AsVariableStatement,
  HasSourceKind,
  KindArrayBindingPattern,
  KindObjectBindingPattern,
} from "@tsonic/target-api/source";
import {
  type Node,
  type SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpStatement,
  CsharpTypeDeclaration,
  CsharpTypeMember,
  CsharpTypeNode,
} from "../../target-ast/syntax/index.js";
import { planLocalDeclaration, planLocalDeclarationStatements } from "../bindings/locals.js";
import { planStatements } from "../statements/index.js";
import { planValueTypeDeclaration } from "../declarations/value-types.js";
import type { DestructuringPlannerState } from "../bindings/index.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";
import { planCsharpModuleCallable } from "./module-callables.js";
import { planResourceRegistrationStatement } from "../statements/resource-management.js";
import { planCsharpNativeMemberHiding } from "../declarations/modifiers.js";

export function planTopLevelVariableStatement(
  statement: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  appendTypeDeclaration: (node: Node, declaration: CsharpTypeDeclaration) => void,
  moduleMembers: CsharpTypeMember[],
  topLevelStatements: CsharpStatement[],
  state: DestructuringPlannerState,
): void {
  const declarationList = AsVariableStatement(input.program.source.ast, statement)!.DeclarationList;
  if (declarationList === undefined) {
    failCsharpPlannerInvariant("An admitted module variable statement requires its checked declaration list.", statement);
  }
  const declarationKind = input.program.source.ast.variableDeclarationKind(declarationList);
  if (declarationKind === undefined) {
    failCsharpPlannerInvariant("An admitted module variable statement requires its checked declaration kind.", statement);
  }
  const declarations = input.program.source.ast.children(declarationList)
    .filter((declaration): declaration is Node => declaration !== undefined && input.program.source.ast.is.IsVariableDeclaration(declaration));
  if (declarations.length === 0) {
    topLevelStatements.push(...planStatements(statement, sourceFile, input, diagnostics, state));
    return;
  }
  const reassignable = declarationKind === "let" || declarationKind === "var";
  for (const declaration of declarations) {
    if (input.program.records.compileTimeMetadata.get(declaration)) continue;
    const valueType = input.program.records.sourceStruct.get(declaration);
    if (valueType !== undefined) {
      const planned = planValueTypeDeclaration(declaration, sourceFile, input, diagnostics);
      if (planned !== undefined) appendTypeDeclaration(declaration, planned);
      continue;
    }
    const variable = AsVariableDeclaration(input.program.source.ast, declaration)!;
    const retainedFields: CsharpTypeMember[] = [];
    const destructured = isBindingPattern(variable.name, input)
      ? planLocalDeclarationStatements(declaration, sourceFile, input, diagnostics, state,
        (binding, sourceDeclaration) => retainedFields.push(topLevelBindingMember(
          binding.name,
          binding.type,
          "public",
          planCsharpNativeMemberHiding(input.program.records.nativeMemberHiding, { kind: "source", declaration: sourceDeclaration, role: "member" }),
          reassignable,
          input.program.records.nativeModuleField.get(sourceDeclaration),
        )))
      : undefined;
    if (destructured !== undefined) {
      moduleMembers.push(...retainedFields);
      topLevelStatements.push(...destructured);
      continue;
    }
    const callableVisibility = input.program.records.callableVisibility.get(declaration);
    if (callableVisibility !== undefined) {
      const callable = input.program.records.moduleCallable.get(declaration);
      if (callable === undefined) failCsharpPlannerInvariant("An admitted native module callable requires its exact declaration plan.", declaration);
      moduleMembers.push(planCsharpModuleCallable(callable, sourceFile, input, diagnostics));
      continue;
    }
    const planned = planLocalDeclaration(declaration, sourceFile, input, diagnostics, state);
    const { initializer: initial, ...binding } = planned;
    const field = { ...binding, ...(initial?.completion.kind === "value" ? { initializer: initial.completion.expression } : {}) };
    moduleMembers.push(topLevelBindingMember(
      field.name,
      field.type,
      "public",
      planCsharpNativeMemberHiding(input.program.records.nativeMemberHiding, { kind: "source", declaration, role: "member" }),
      reassignable,
      input.program.records.nativeModuleField.get(declaration),
    ));
    if (initial !== undefined) topLevelStatements.push(...initial.prelude);
    if (field.initializer !== undefined) {
      topLevelStatements.push(topLevelFieldAssignment(field.name, field.initializer));
    }
    const resourceKind = input.program.source.ast.variableDeclarationKind(declaration);
    if ((resourceKind === "using" || resourceKind === "await using") && initial?.completion.kind !== "never") {
      const registration = planResourceRegistrationStatement(
        declaration,
        field,
        input,
        state,
      );
      topLevelStatements.push(registration);
    }
  }
}

export function topLevelBindingMember(
  name: string,
  type: CsharpTypeNode,
  accessibility: "public" | "private",
  hiding: readonly "new"[],
  reassignable = false,
  nativeField = false,
): CsharpTypeMember {
  const initializer = {
    kind: "DefaultExpression",
    type,
    nullForgiving: true,
  } as const;
  if (nativeField) return {
    kind: "FieldDeclaration", name, type, modifiers: [accessibility, "static", ...hiding], initializer,
  };
  return {
    kind: "PropertyDeclaration",
    name,
    type,
    modifiers: [accessibility, "static", ...hiding],
    initializer,
    autoGetter: true,
    autoSetter: true,
    ...(accessibility === "public"
      ? {
          autoSetterModifiers: [reassignable ? "internal" : "private"] as const,
        }
      : {}),
  };
}

export function topLevelFieldAssignment(
  name: string,
  initializer: CsharpExpression,
): CsharpStatement {
  return {
    kind: "ExpressionStatement",
    expression: {
      kind: "AssignmentExpression",
      left: { kind: "IdentifierName", name },
      operatorToken: { kind: "EqualsToken" },
      right: initializer,
    },
  };
}

function isBindingPattern(node: Node | undefined, input: CsharpPlanningContext): boolean {
  return HasSourceKind(input.program.source.ast, node, KindObjectBindingPattern) ||
    HasSourceKind(input.program.source.ast, node, KindArrayBindingPattern);
}
