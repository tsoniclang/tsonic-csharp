import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  Signature,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeParent,
  getPropertyAccessName,
} from "../../../ast-utils.js";

export function getSignatureDeclaration(
  signature: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): Node | undefined {
  const checker = context.compiler?.checker;
  return signature === undefined ||
    checker === undefined ||
    typeof checker.getSignatureDeclaration !== "function"
    ? undefined
    : asNodeSubject(checker.getSignatureDeclaration(signature as Signature));
}

export {
  getNodeParent,
  getPropertyAccessName,
};
