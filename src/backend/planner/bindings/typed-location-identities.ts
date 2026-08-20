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

export function planCsharpTypedLocationIdentityDeclaration(
  declaration: Node,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
): CsharpStatement | undefined {
  if (!input.artifacts.consumeTypedLocationIdentity(declaration)) {
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
