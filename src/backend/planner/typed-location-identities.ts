import type {
  Node,
} from "@tsonic/tsts";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import type {
  CsharpStatement,
} from "../roslyn/syntax.js";
import {
  declareCsharpTypedLocationIdentityName,
} from "./bindings.js";
import type {
  DestructuringPlannerState,
} from "./bindings.js";

export function planCsharpTypedLocationIdentityDeclaration(
  declaration: Node,
  input: CsharpTranslationContext,
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
