import type { Type } from "@tsonic/tsts";
import { sourceCallableParameterEvidence, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { selectCsharpClassFactoryType } from "../../../project-types/class-factory-types.js";
import { resolveCsharpSourceEffectiveType } from "./effective-types.js";
import { nextState } from "./state.js";

export function resolveCsharpConstructorValueType(
  scope: CsharpTypeResolutionScope,
  type: Type | undefined,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  if (type === undefined) return undefined;
  const signatures = queries.types.signatureInfos(type, "construct");
  if (signatures.length === 0 || queries.types.callSignatures(type).length !== 0) return undefined;
  const signature = signatures[0]!;
  const result = signature.returnType;
  if (result === undefined) return undefined;
  const symbol = queries.declarations.typeSymbol(type);
  const owner = symbol === undefined ? undefined : queries.declarations.symbolDeclarations(symbol)
    .map(candidate => scope.host.projectTypeCatalog.definitionForDeclaration(candidate)).find(candidate => candidate !== undefined);
  if (owner?.local === true) {
    if (!signatures.every(candidate => {
      const selected = candidate.returnType;
      return selected !== undefined && queries.types.isIdentical(result, selected);
    })) return undefined;
    const instance = resolveCsharpSourceEffectiveType(scope, owner.declaration, nextState(state))?.result?.selectedType;
    if (instance?.kind !== "target-named" || instance.id !== owner.id) return undefined;
    return selectCsharpClassFactoryType(scope.host.ast, scope.host.projectTypeCatalog, instance);
  }
  if (signatures.length !== 1) return undefined;
  const declaration = queries.declarations.signatureDeclaration(signature.signature);
  if (declaration === undefined || owner?.abstract === true ||
    (owner?.kind !== "class" && !scope.host.ast.is.IsConstructSignatureDeclaration(declaration) &&
      !scope.host.ast.is.IsConstructorTypeNode(declaration))) return undefined;
  const returnNode = scope.host.ast.typeNode(declaration);
  return scope.resolveCallableEvidence({
    parameters: signature.parameters.map(parameter => sourceCallableParameterEvidence(parameter, scope.host.ast)),
    result: { selectedType: result, ...(returnNode === undefined ? {} : { authoredTypeNode: returnNode }) },
  }, queries, state);
}
