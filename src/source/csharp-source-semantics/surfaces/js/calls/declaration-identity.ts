import type {
  ExtensionFactSubject,
  Node,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeParent,
  getPropertyAccessName,
} from "../../../ast-utils.js";

export function getSignatureDeclaration(signature: ExtensionFactSubject | undefined): Node | undefined {
  return asNodeSubject((signature as { readonly declaration?: unknown } | undefined)?.declaration);
}

export {
  getNodeParent,
  getPropertyAccessName,
};
