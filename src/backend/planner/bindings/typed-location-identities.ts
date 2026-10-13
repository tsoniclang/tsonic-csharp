import type {
  Node,
} from "@tsonic/tsts";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type {
  CsharpStatement,
} from "../../target-ast/syntax/index.js";
import {
  declareCsharpTypedLocationIdentityName,
} from "./index.js";
import type {
  DestructuringPlannerState,
} from "./index.js";
import { redirectCsharpParameterStorage } from "./binding-state.js";
import { planCsharpNativeMemoryCall } from "../expressions/native-memory.js";
import { csharpRuntimeLocationTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";

export function planCsharpParameterStorageDeclaration(
  declaration: Node,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
  diagnostics: TargetDiagnostic[],
): Extract<CsharpStatement, { readonly kind: "LocalDeclarationStatement" }> | undefined {
  const backing = input.program.records.nativeBacking.get(declaration);
  const name = input.program.source.ast.name(declaration);
  if (backing !== undefined && name !== undefined && input.program.source.ast.is.IsParameterDeclaration(declaration)) {
    const binding = redirectCsharpParameterStorage(name, input, state);
    const type = csharpTypeFromTargetTypeRef(csharpRuntimeLocationTargetType(backing.pointeeType), input.scope.typeParameterNames);
    if (binding === undefined || type === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(declaration,
        "Sealed native parameter storage requires its exact planned binding and type."));
      return undefined;
    }
    return { kind: "LocalDeclarationStatement", name: binding.storageName, type,
      initializer: planCsharpNativeMemoryCall(input.scope.typeParameterNames, "Allocate", { kind: "IdentifierName", name: binding.parameterName }, backing) };
  }
  return planCsharpTypedLocationIdentityDeclaration(declaration, input, state);
}

export function planCsharpTypedLocationIdentityDeclaration(
  declaration: Node,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
): Extract<CsharpStatement, { readonly kind: "LocalDeclarationStatement" }> | undefined {
  if (input.program.records.capturedBinding.get(declaration) !== undefined || !input.program.records.typedLocationIdentity.get(declaration)) {
    return undefined;
  }
  return {
    kind: "LocalDeclarationStatement",
    name: declareCsharpTypedLocationIdentityName(declaration, state),
    type: { kind: "PredefinedType", name: "object" },
    initializer: {
      kind: "ObjectCreationExpression",
      type: { kind: "PredefinedType", name: "object" },
    },
  };
}
