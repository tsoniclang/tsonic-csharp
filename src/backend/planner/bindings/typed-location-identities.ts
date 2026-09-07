import type {
  Node,
} from "@tsonic/tsts";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type {
  CsharpStatement,
} from "../../target-ast/roslyn/index.js";
import {
  declareCsharpTypedLocationIdentityName,
} from "./index.js";
import type {
  DestructuringPlannerState,
} from "./index.js";
import { redirectCsharpParameterStorage } from "./binding-state.js";
import { planCsharpNativeMemoryCall } from "../expressions/native-memory.js";
import { csharpRuntimeLocationTargetType } from "../../../target-model/types/runtime-carriers.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";

export function planCsharpParameterStorageDeclaration(
  declaration: Node,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
  diagnostics: TargetDiagnostic[],
): CsharpStatement | undefined {
  const backing = input.program.storage.nativeBacking(declaration);
  const name = input.program.source.ast.name(declaration);
  if (backing !== undefined && name !== undefined && input.program.source.ast.is.IsParameterDeclaration(declaration)) {
    const binding = redirectCsharpParameterStorage(name, input, state);
    const type = csharpTypeFromTargetTypeRef(csharpRuntimeLocationTargetType(backing.pointeeType));
    if (binding === undefined || type === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(declaration,
        "Sealed native parameter storage requires its exact planned binding and type."));
      return undefined;
    }
    return { kind: "LocalDeclarationStatement", name: binding.storageName, type,
      initializer: planCsharpNativeMemoryCall("Allocate", { kind: "IdentifierName", name: binding.parameterName }, backing) };
  }
  return planCsharpTypedLocationIdentityDeclaration(declaration, input, state);
}

export function planCsharpTypedLocationIdentityDeclaration(
  declaration: Node,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
): CsharpStatement | undefined {
  if (!input.program.storage.requiresTypedLocationIdentity(declaration)) {
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
