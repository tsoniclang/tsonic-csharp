import type { Type } from "@tsonic/tsts";
import { Node_Initializer, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./engine.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { csharpClassFactoryTargetType } from "../../../target-model/types/class-factories.js";
import { nextState } from "./state.js";

export function resolveCsharpConstructorValueType(
  scope: CsharpTypeResolutionScope,
  type: Type | undefined,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  if (type === undefined) return undefined;
  const signatures = queries.types.constructSignatures(type);
  if (signatures.length === 0 || queries.types.callSignatures(type).length !== 0) return undefined;
  const signature = signatures[0]!;
  const result = queries.types.returnType(signature);
  if (result === undefined) return undefined;
  const symbol = queries.declarations.typeSymbol(type);
  const owner = symbol === undefined ? undefined : queries.declarations.symbolDeclarations(symbol)
    .map(candidate => scope.host.projectTypeCatalog.definitionForDeclaration(candidate)).find(candidate => candidate !== undefined);
  if (owner?.local === true) {
    if (!signatures.every(candidate => {
      const selected = queries.types.returnType(candidate);
      return selected !== undefined && queries.types.isIdentical(result, selected);
    })) return undefined;
    const instance = scope.resolveTypeWithState(result, queries.sourceFile, nextState(state));
    if (instance?.kind !== "target-named" || instance.id !== owner.id) return undefined;
    const names = new Set(scope.host.ast.members(owner.declaration).map(member => scope.host.ast.text(scope.host.ast.name(member))));
    let createMethodName = "Create";
    while (names.has(createMethodName)) createMethodName = `_${createMethodName}`;
    names.add(createMethodName);
    let instanceTestMethodName = "IsInstance";
    while (names.has(instanceTestMethodName)) instanceTestMethodName = `_${instanceTestMethodName}`;
    return csharpClassFactoryTargetType(owner.declaration, instance, owner.factoryName!, owner.outerTypeParameters.length,
      createMethodName, instanceTestMethodName);
  }
  if (signatures.length !== 1) return undefined;
  const declaration = queries.declarations.signatureDeclaration(signature);
  if (declaration === undefined || owner?.abstract === true ||
    (owner?.kind !== "class" && !scope.host.ast.is.IsConstructSignatureDeclaration(declaration) &&
      !scope.host.ast.is.IsConstructorTypeNode(declaration))) return undefined;
  const returnNode = scope.host.ast.typeNode(declaration);
  return scope.resolveCallableEvidence({
    parameters: queries.types.signatureParameterInfos(signature).map(parameter => ({
      ...parameter,
      omissionKind: parameter.parameterKind === "rest" ? "rest" : parameter.parameterKind === "optional"
        ? "undefined" : parameter.declaration !== undefined && Node_Initializer(scope.host.ast, parameter.declaration) !== undefined
          ? "initializer" : "required",
    })),
    result: { selectedType: result, ...(returnNode === undefined ? {} : { authoredTypeNode: returnNode }) },
  }, queries, state);
}
