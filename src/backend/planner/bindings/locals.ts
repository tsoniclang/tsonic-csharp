import type { CsharpPlanningContext } from "../context.js";
import {
  AsAsExpression,
  AsTypeAssertion,
  AsVariableDeclaration,
  HasSourceKind,
  KindArrowFunction,
  KindCallExpression,
  KindFunctionExpression,
  KindNewExpression,
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpLocalDeclaration,
  CsharpStatement,
} from "../../target-ast/roslyn/index.js";
import { getCsharpTypeForNode } from "../types/index.js";
import {
  getTargetTypeRefForNode,
} from "../types/runtime-carriers.js";
import {
  getCsharpTypeFromSemanticType,
} from "../types/csharp-semantic-types.js";
import { planExpressionWithExpectedType } from "../expressions/index.js";
import { getLambdaTargetContext } from "../expressions/expression-lambdas.js";
import { planVariableBindingStatements } from "./index.js";
import {
  declareCsharpLocalBindingName,
} from "./index.js";
import type { DestructuringPlannerState } from "./index.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import {
  targetTypeRefEquals,
} from "../../../target-model/types/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  planCsharpSourceUndefinedValue,
} from "../expressions/undefined-values.js";
import {
  planCsharpTypedLocationIdentityDeclaration,
} from "./typed-location-identities.js";
import {
  planResourceRegistrationStatement,
} from "../statements/resource-management.js";
import {
  convertCsharpYieldResumeExpression,
  planCsharpYieldValue,
} from "../statements/statement-yield.js";
import {
  directCsharpSourceYieldExpression,
} from "../../../target-model/syntax/yield-expression.js";

export function planLocalDeclaration(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  initializerOverride?: CsharpExpression,
): CsharpLocalDeclaration {
  const variable = AsVariableDeclaration(input.program.source.ast, declarationNode)!;
  const typeSubject = variable.Type ?? getInitializerTypeSubject(variable.Initializer, sourceFile, input) ?? variable.name ?? variable.Initializer;
  const expectedTargetType = getTargetTypeRefForNode(input, typeSubject, sourceFile) ??
    getTargetTypeRefForNode(input, variable.name, sourceFile);
  const explicitType = variable.Type === undefined
    ? undefined
    : getCsharpTypeForNode(variable.Type, sourceFile, input, undefined, diagnostics);
  const lambdaInitializer = variable.Initializer !== undefined &&
    (
      HasSourceKind(input.program.source.ast, variable.Initializer, KindArrowFunction) ||
      HasSourceKind(input.program.source.ast, variable.Initializer, KindFunctionExpression)
    );
  const inferredLambdaType = lambdaInitializer
    ? getLambdaTargetContext(
        variable.Initializer!,
        sourceFile,
        input,
        explicitType,
        variable.Type === undefined ? undefined : expectedTargetType,
      )?.type
    : undefined;
  const constAssertionType = variable.Type === undefined && variable.Initializer !== undefined
    ? getConstAssertionInitializerType(variable.Initializer, sourceFile, input)
    : undefined;
  const inferredTargetType = input.program.sourceEvidence.storageTargetType(
    declarationNode,
  );
  const storageType = input.program.storage.type(declarationNode);
  const requiredStorageType = storageType !== undefined &&
      inferredTargetType !== undefined &&
      !targetTypeRefEquals(storageType, inferredTargetType)
    ? csharpTypeFromTargetTypeRef(storageType)
    : undefined;
  const type = requiredStorageType ??
    inferredLambdaType ??
    explicitType ??
    constAssertionType ??
    (storageType === undefined
      ? undefined
      : csharpTypeFromTargetTypeRef(storageType)) ??
    getCsharpTypeForNode(typeSubject, sourceFile, input, undefined, diagnostics);
  const name = declareCsharpLocalBindingName(variable.name, input, diagnostics, state, "Local binding name", "LocalDeclarationStatement");
  let initializer: CsharpExpression | undefined;
  if (initializerOverride !== undefined) {
    initializer = initializerOverride;
  } else if (variable.Initializer !== undefined) {
    initializer = planExpressionWithExpectedType(
      variable.Initializer,
      sourceFile,
      input,
      diagnostics,
      type,
      variable.Type ?? variable.name,
      state,
      lambdaInitializer && variable.Type === undefined
        ? undefined
        : expectedTargetType,
    );
  } else if (inferredTargetType !== undefined) {
    const undefinedValue = planCsharpSourceUndefinedValue(
      declarationNode,
      inferredTargetType,
      sourceFile,
      input,
      diagnostics,
    );
    initializer = undefinedValue.kind === "resolved"
      ? undefinedValue.expression
      : {
          kind: "DefaultExpression",
          type,
          nullForgiving: true,
        };
  }
  return {
    kind: "VariableDeclarator",
    name,
    type,
    ...(initializer === undefined ? {} : { initializer }),
  };
}

export function planLocalDeclarationStatements(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const variable = AsVariableDeclaration(input.program.source.ast, declarationNode)!;
  const declarationKind = input.program.source.ast.variableDeclarationKind(declarationNode);
  if (declarationKind === "using" || declarationKind === "await using") {
    if (!input.program.source.ast.is.IsIdentifier(variable.name)) {
      diagnostics.push(unsupportedNodeDiagnostic(
        variable.name ?? declarationNode,
        "A resource declaration requires one exact identifier binding in C#.",
      ));
      return [];
    }
    const locationIdentity = planCsharpTypedLocationIdentityDeclaration(
      declarationNode,
      input,
      state,
    );
    const local = planLocalDeclaration(
      declarationNode,
      sourceFile,
      input,
      diagnostics,
      state,
    );
    const registration = planResourceRegistrationStatement(
      declarationNode,
      local,
      input,
      diagnostics,
      state,
    );
    return [
      ...(locationIdentity === undefined ? [] : [locationIdentity]),
      {
        kind: "LocalDeclarationStatement",
        name: local.name,
        type: local.type,
        ...(local.initializer === undefined
          ? {}
          : { initializer: local.initializer }),
      },
      ...(registration === undefined ? [] : [registration]),
    ];
  }
  const directYield = state.generator === undefined
    ? undefined
    : directCsharpSourceYieldExpression(
        input.program.source.ast,
        variable.Initializer,
      );
  if (directYield !== undefined) {
    if (!input.program.source.ast.is.IsIdentifier(variable.name)) {
      diagnostics.push(unsupportedNodeDiagnostic(
        variable.name ?? declarationNode,
        "A yield initializer with a binding pattern requires an explicit post-resume destructuring plan.",
      ));
      return [];
    }
    const yieldPlan = planCsharpYieldValue(
      directYield,
      sourceFile,
      input,
      diagnostics,
      state,
    );
    if (yieldPlan === undefined) {
      return [];
    }
    const locationIdentity = planCsharpTypedLocationIdentityDeclaration(
      declarationNode,
      input,
      state,
    );
    const local = planLocalDeclaration(
      declarationNode,
      sourceFile,
      input,
      diagnostics,
      state,
      yieldPlan.resumeExpression,
    );
    const targetType = input.types.classifications.resolveStorage(
      declarationNode,
      sourceFile,
    );
    const initializer = targetType === undefined
      ? yieldPlan.resumeExpression
      : convertCsharpYieldResumeExpression(
          directYield,
          yieldPlan,
          targetType,
          sourceFile,
          input,
          diagnostics,
        );
    if (initializer === undefined) {
      return [];
    }
    return [
      ...yieldPlan.statements,
      ...(locationIdentity === undefined ? [] : [locationIdentity]),
      {
        kind: "LocalDeclarationStatement",
        name: local.name,
        type: local.type,
        initializer,
      },
    ];
  }
  const destructured = planVariableBindingStatements(variable.name, variable.Initializer, sourceFile, input, diagnostics, state);
  if (destructured !== undefined) {
    return destructured;
  }
  const locationIdentity = input.program.source.ast.is.IsIdentifier(variable.name)
    ? planCsharpTypedLocationIdentityDeclaration(
        declarationNode,
        input,
        state,
      )
    : undefined;
  const local = planLocalDeclaration(declarationNode, sourceFile, input, diagnostics, state);
  if (
    variable.Initializer !== undefined &&
    local.initializer?.kind === "LambdaExpression" &&
    sourceInitializerReferencesDeclaration(
      variable.Initializer,
      declarationNode,
      input,
    )
  ) {
    return [
      ...(locationIdentity === undefined ? [] : [locationIdentity]),
      {
        kind: "LocalDeclarationStatement",
        name: local.name,
        type: local.type,
        initializer: {
          kind: "DefaultExpression",
          type: local.type,
          nullForgiving: true,
        },
      },
      {
        kind: "ExpressionStatement",
        expression: {
          kind: "AssignmentExpression",
          left: { kind: "IdentifierName", name: local.name },
          operatorToken: { kind: "EqualsToken" },
          right: local.initializer,
        },
      },
    ];
  }
  return [
    ...(locationIdentity === undefined ? [] : [locationIdentity]),
    {
      kind: "LocalDeclarationStatement",
      name: local.name,
      type: local.type,
      ...(local.initializer === undefined ? {} : { initializer: local.initializer }),
    },
  ];
}

function sourceInitializerReferencesDeclaration(
  node: Node,
  declaration: Node,
  input: CsharpPlanningContext,
): boolean {
  if (input.program.sourceNavigation.referenceFor(node)?.declaration === declaration) {
    return true;
  }
  return input.program.source.ast.children(node).some((child) =>
    child !== undefined &&
    sourceInitializerReferencesDeclaration(child, declaration, input)
  );
}

function getInitializerTypeSubject(
  initializer: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
): Node | undefined {
  if (initializer === undefined) {
    return undefined;
  }
  const assertion = AsAsExpression(input.program.source.ast, initializer) ?? AsTypeAssertion(input.program.source.ast, initializer);
  const assertedTarget = assertion?.Type;
  if (assertedTarget !== undefined && input.program.source.ast.isConstAssertion(initializer)) {
    return assertion?.Expression;
  }
  if (assertedTarget !== undefined) {
    return assertedTarget;
  }
  if (HasSourceKind(input.program.source.ast, initializer, KindArrowFunction) || HasSourceKind(input.program.source.ast, initializer, KindFunctionExpression)) {
    return initializer;
  }
  if (HasSourceKind(input.program.source.ast, initializer, KindCallExpression) || HasSourceKind(input.program.source.ast, initializer, KindNewExpression)) {
    return initializer;
  }
  return getTargetTypeRefForNode(input, initializer, sourceFile) !== undefined
    ? initializer
    : undefined;
}

function getConstAssertionInitializerType(
  initializer: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
): CsharpLocalDeclaration["type"] | undefined {
  const assertion = AsAsExpression(input.program.source.ast, initializer) ?? AsTypeAssertion(input.program.source.ast, initializer);
  if (
    assertion?.Type === undefined ||
    assertion.Expression === undefined ||
    !input.program.source.ast.isConstAssertion(initializer)
  ) {
    return undefined;
  }
  return getCsharpTypeFromSemanticType(
    input.program.sourceEvidence.expressionType(assertion.Expression),
    sourceFile,
    input,
  );
}
