import type {
  Node,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpSourceCallableContract,
  CsharpSourceCallableParameterContract,
  CsharpProjectForwardingConstructor,
  TargetTypeRef,
} from "../../policy/types/index.js";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";

export function publishCsharpSourceCallableContract(
  declaration: Node,
  parameters: readonly CsharpSourceCallableParameterContract[] | undefined,
  returnType: TargetTypeRef | undefined,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): void {
  if (parameters === undefined || returnType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      declaration,
      "A source-owned C# callable requires closed target parameter and return contracts before publication.",
    ));
    return;
  }
  const typeParameterNames = input.ast.typeParameters(declaration).map(
    (parameter) => {
      const name = input.ast.name(parameter);
      return name === undefined ? undefined : input.ast.text(name);
    },
  );
  if (
    typeParameterNames.some((name) => name === undefined || name.length === 0) ||
    new Set(typeParameterNames).size !== typeParameterNames.length
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      declaration,
      "A source-owned C# callable requires distinct compiler-owned type parameter identities before publication.",
    ));
    return;
  }
  const receiverTypeOwner = sourceCallableReceiverTypeOwner(
    declaration,
    input,
  );
  const callable: CsharpSourceCallableContract = Object.freeze({
    sourceDeclaration: declaration,
    methodTypeParameterNames: Object.freeze(typeParameterNames as string[]),
    ...receiverTypeOwner === undefined
      ? {}
      : { receiverTypeOwner },
    parameters: Object.freeze([...parameters]),
    returnType,
  });
  const published = input.artifacts.publishSourceCallable(
    { kind: "declaration", declaration },
    callable,
  );
  if (published.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(
      declaration,
      published.reason,
    ));
  }
}

export function publishCsharpProjectConstructorCallableContract(
  constructor: CsharpProjectForwardingConstructor,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): void {
  const declaringType = constructor.targetMember.declaringType;
  if (
    declaringType === undefined ||
    constructor.source.parameters.length !==
      constructor.targetMember.parameters.length
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      constructor.source.declaration ?? constructor.definition.declaration,
      "An implicit project constructor requires one exact target declaring type and parameter relation before callable publication.",
    ));
    return;
  }
  const callable: CsharpSourceCallableContract = Object.freeze({
    sourceDeclaration:
      constructor.source.declaration ?? constructor.definition.declaration,
    methodTypeParameterNames: Object.freeze([]),
    receiverTypeOwner: constructor.definition.declaration,
    parameters: Object.freeze(constructor.source.parameters.map(
      (parameter, index) => Object.freeze({
        sourceParameter: parameter.parameterDeclaration,
        targetParameter: constructor.targetMember.parameters[index]!,
      }),
    )),
    returnType: declaringType,
  });
  const published = input.artifacts.publishSourceCallable(
    {
      kind: "project-constructor",
      targetMemberId: constructor.targetMember.id,
    },
    callable,
  );
  if (published.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(
      constructor.source.declaration ?? constructor.definition.declaration,
      published.reason,
    ));
  }
}

function sourceCallableReceiverTypeOwner(
  declaration: Node,
  input: CsharpTranslationContext,
): Node | undefined {
  const parent = input.ast.parent(declaration);
  return parent !== undefined &&
      (
        input.ast.is.IsClassDeclaration(parent) ||
        input.ast.is.IsInterfaceDeclaration(parent)
      )
    ? parent
    : undefined;
}
