import type { Type } from "@tsonic/tsts";
import { Node_Initializer, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./engine.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { getCsharpDelegateSignature } from "../../../target-model/types/delegates.js";
import { csharpClassFactoryTargetType } from "../../../target-model/types/class-factories.js";

export function resolveCsharpConstructorValueType(
  scope: CsharpTypeResolutionScope,
  type: Type | undefined,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  if (type === undefined) return undefined;
  const signatures = queries.types.constructSignatures(type);
  if (signatures.length !== 1 || queries.types.callSignatures(type).length !== 0) return undefined;
  const signature = signatures[0]!;
  const result = queries.types.returnType(signature);
  if (result === undefined) return undefined;
  const declaration = queries.declarations.signatureDeclaration(signature);
  const returnNode = declaration !== undefined && scope.host.ast.is.IsConstructSignatureDeclaration(declaration)
    ? scope.host.ast.typeNode(declaration) : undefined;
  const callable = scope.resolveCallableEvidence({
    parameters: queries.types.signatureParameterInfos(signature).map(parameter => ({
      ...parameter,
      omissionKind: parameter.parameterKind === "rest" ? "rest" : parameter.parameterKind === "optional"
        ? "undefined" : parameter.declaration !== undefined && Node_Initializer(scope.host.ast, parameter.declaration) !== undefined
          ? "initializer" : "required",
    })),
    result: { selectedType: result, ...(returnNode === undefined ? {} : { authoredTypeNode: returnNode }) },
  }, queries, state);
  const symbol = queries.declarations.typeSymbol(type);
  const owner = symbol === undefined ? undefined : queries.declarations.symbolDeclarations(symbol)
    .map(candidate => scope.host.projectTypeCatalog.definitionForDeclaration(candidate)).find(candidate => candidate?.local);
  const selected = getCsharpDelegateSignature(callable);
  if (owner === undefined || selected?.returnType.kind !== "target-named") return callable;
  const names = new Set(scope.host.ast.members(owner.declaration).map(member => scope.host.ast.text(scope.host.ast.name(member))));
  let createMethodName = "Create";
  while (names.has(createMethodName)) createMethodName = `_${createMethodName}`;
  names.add(createMethodName);
  let instanceTestMethodName = "IsInstance";
  while (names.has(instanceTestMethodName)) instanceTestMethodName = `_${instanceTestMethodName}`;
  return csharpClassFactoryTargetType(owner.declaration, selected.returnType, owner.factoryName!, selected, createMethodName, instanceTestMethodName);
}
