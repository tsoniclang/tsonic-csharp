import type { AstReader, Node } from "@tsonic/tsts";
import type { CsharpNativeMemberNames } from "../../../target-model/names/model.js";
import type { CsharpMethodDeclarationEmission } from "../../../target-model/records/method-emission.js";
import { createCsharpMethodEmissionRecords } from "../../program/records/method-emission.js";

export function analyzeCsharpMethodEmission(ast: AstReader, names: CsharpNativeMemberNames) {
  const methods = new Map<Node, CsharpMethodDeclarationEmission>();
  for (const entry of names.declarationNames) {
    if (ast.is.IsMethodDeclaration(entry.declaration)) methods.set(entry.declaration, Object.freeze({ name: entry.name }));
  }
  return createCsharpMethodEmissionRecords(methods);
}
