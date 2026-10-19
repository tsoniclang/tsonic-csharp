import type { CsharpPlanningContext } from "../context.js";
import { AsVariableDeclaration } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpLocalDeclaration,
  CsharpStatement,
} from "../../target-ast/syntax/index.js";
import { planExpression } from "../expressions/index.js";
import { planCsharpNativeMemoryCall } from "../expressions/native-memory.js";
import { csharpRuntimeLocationTargetType, csharpRuntimeNativeArrayTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { planVariableBindingStatements } from "./index.js";
import {
  declareCsharpLocalBindingName,
} from "./index.js";
import type { DestructuringPlannerState } from "./index.js";
import type { CsharpEntryBinding } from "./binding-patterns.js";
import { planCsharpCapturedInitialization } from "./capture-storage.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import {
  failCsharpPlannerInvariant,
} from "../diagnostics.js";
import {
  planCsharpAbsentValue,
} from "../expressions/optional-storage.js";
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
import { csharpPlannedValue, mapCsharpPlannedValue, type CsharpPlannedValue } from "../expressions/planned-values.js";
import { consumeCsharpPlannedValue } from "../statements/statement-output.js";

export type CsharpPlannedLocalDeclaration = Omit<CsharpLocalDeclaration, "initializer"> & {
  readonly initializer?: CsharpPlannedValue;
};

export function planLocalDeclaration(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  initializerOverride?: CsharpExpression,
): CsharpPlannedLocalDeclaration {
  const variable = AsVariableDeclaration(input.program.source.ast, declarationNode)!;
  const completion = input.program.records.localBinding.get(declarationNode);
  if (completion === undefined) failCsharpPlannerInvariant("An admitted local requires its sealed native binding completion.", declarationNode);
  const storageType = input.program.records.storageType.get(declarationNode);
  const initializerCarrier = completion.carrier;
  if (initializerCarrier === undefined) failCsharpPlannerInvariant(
    "An admitted local declaration lost its finalized native storage carrier.", declarationNode);
  const type = csharpTypeFromTargetTypeRef(initializerCarrier, input.scope.typeParameterNames);
  if (type === undefined) failCsharpPlannerInvariant(
    "An admitted local declaration lost its renderable native storage carrier.", declarationNode);
  const name = declareCsharpLocalBindingName(variable.name!, input, state);
  let initializer: CsharpPlannedValue | undefined;
  if (initializerOverride !== undefined) {
    initializer = csharpPlannedValue(initializerCarrier, initializerOverride);
  } else if (variable.Initializer !== undefined) {
    initializer = planExpression(variable.Initializer, sourceFile, input, diagnostics, state
    );
    if (initializer === undefined) failCsharpPlannerInvariant("An admitted local requires its native initializer value plan.", variable.Initializer);
  } else if (completion.initialization === "absence") {
    if (storageType === undefined) failCsharpPlannerInvariant(
      "An admitted local declaration requires its finalized native storage carrier.", declarationNode);
    const expression = planCsharpAbsentValue(storageType, input.scope.typeParameterNames);
    if (expression === undefined) failCsharpPlannerInvariant(
      "An admitted absence-bearing local requires its native absence representation.", declarationNode);
    initializer = csharpPlannedValue(storageType, expression);
  }
  const nativeArray = input.program.records.nativeArray.get(declarationNode);
  if (nativeArray !== undefined && initializer !== undefined) {
    const nativeType = csharpTypeFromTargetTypeRef(csharpRuntimeNativeArrayTargetType(nativeArray.layout.pointeeType), input.scope.typeParameterNames);
    if (nativeType !== undefined) return { kind: "VariableDeclarator", name, type: nativeType, initializer };
    failCsharpPlannerInvariant("An admitted native array lost its renderable storage type.", declarationNode);
  }
  const nativeBacking = input.program.records.nativeBacking.get(declarationNode);
  if (nativeBacking !== undefined && initializer !== undefined) {
    const nativeType = csharpTypeFromTargetTypeRef(csharpRuntimeLocationTargetType(nativeBacking.pointeeType), input.scope.typeParameterNames);
    if (nativeType !== undefined) return { kind: "VariableDeclarator", name, type: nativeType,
      initializer: mapCsharpPlannedValue(initializer, csharpRuntimeLocationTargetType(nativeBacking.pointeeType),
        value => planCsharpNativeMemoryCall(input.scope.typeParameterNames, "Allocate", value, nativeBacking)) };
    failCsharpPlannerInvariant("An admitted native local backing lost its renderable location type.", declarationNode);
  }
  return {
    kind: "VariableDeclarator",
    name,
    type,
    ...(initializer === undefined ? {} : { initializer }),
    ...(completion.refKind === undefined ? {} : { refKind: completion.refKind }),
  };
}

export function planLocalDeclarationStatements(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  retainBinding?: (binding: CsharpEntryBinding, declaration: Node) => void,
): readonly CsharpStatement[] {
  if (input.program.records.compileTimeMetadata.get(declarationNode)) return [];
  const variable = AsVariableDeclaration(input.program.source.ast, declarationNode)!;
  const declarationKind = input.program.source.ast.variableDeclarationKind(declarationNode);
  if (declarationKind === "using" || declarationKind === "await using") {
    if (!input.program.source.ast.is.IsIdentifier(variable.name)) {
      return failCsharpPlannerInvariant("An admitted resource lost its exact identifier binding.", variable.name ?? declarationNode);
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
    const emit = (initializer?: CsharpExpression): readonly CsharpStatement[] => {
      const { initializer: _planned, ...binding } = local;
      const selected = { ...binding, ...(initializer === undefined ? {} : { initializer }) };
      const registration = planResourceRegistrationStatement(declarationNode, selected, input, state);
      return [...(locationIdentity === undefined ? [] : [locationIdentity]),
        { ...selected, kind: "LocalDeclarationStatement" },
        registration];
    };
    return local.initializer === undefined ? emit() : consumeCsharpPlannedValue(local.initializer, emit);
  }
  const directYield = state.generator === undefined
    ? undefined
    : directCsharpSourceYieldExpression(
        input.program.source.ast,
        variable.Initializer,
      );
  if (directYield !== undefined) {
    if (!input.program.source.ast.is.IsIdentifier(variable.name)) {
      return failCsharpPlannerInvariant("An admitted yield initializer lost its exact post-resume identifier binding.",
        variable.name ?? declarationNode);
    }
    const yieldPlan = planCsharpYieldValue(
      directYield,
      sourceFile,
      input,
      diagnostics,
      state,
    );
    if (yieldPlan === undefined) {
      return failCsharpPlannerInvariant("An admitted yield initializer requires its native suspension plan.", directYield);
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
      return failCsharpPlannerInvariant("An admitted yield initializer requires its native resume conversion.", directYield);
    }
    return [
      ...yieldPlan.statements,
      ...(locationIdentity === undefined ? [] : [locationIdentity]),
      {
        kind: "LocalDeclarationStatement",
        name: local.name,
        type: local.type,
        initializer,
        ...(local.refKind === undefined ? {} : { refKind: local.refKind }),
      },
    ];
  }
  const destructured = planVariableBindingStatements(variable.name, variable.Initializer, sourceFile, input, diagnostics, state, retainBinding);
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
  const emit = (initializer?: CsharpExpression): readonly CsharpStatement[] => {
    const captured = planCsharpCapturedInitialization(declarationNode, initializer, input, state);
    if (captured !== undefined) return [...(locationIdentity === undefined ? [] : [locationIdentity]), captured];
    if (initializer === undefined && input.program.records.capturedBinding.get(declarationNode) !== undefined) {
      return locationIdentity === undefined ? [] : [locationIdentity];
    }
    if (
    initializer !== undefined && input.program.records.localBinding.get(declarationNode)?.recursiveInitializer === true
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
          right: initializer,
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
      ...(initializer === undefined ? {} : { initializer }),
      ...(local.refKind === undefined ? {} : { refKind: local.refKind }),
    },
  ];
  };
  return local.initializer === undefined ? emit() : consumeCsharpPlannedValue(local.initializer, emit);
}

