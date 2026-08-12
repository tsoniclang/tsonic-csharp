import type {
  Node,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import type {
  CsharpProjectForwardingConstructor,
  CsharpTargetParameter,
} from "../../policy/types/index.js";
import type {
  CsharpArgument,
  CsharpConstructorDeclaration,
  CsharpModifier,
  CsharpParameter,
} from "../roslyn/syntax.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  publishCsharpProjectConstructorCallableContract,
} from "./source-callable-contracts.js";
import {
  requireCsharpIdentifier,
} from "./identifiers.js";
import {
  csharpSafetyModifiersForDeclaration,
} from "./explicit-safety.js";

export function planImplicitForwardingConstructors(
  declaration: Node,
  className: string,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): readonly CsharpConstructorDeclaration[] {
  const constructors = input.projectTypes
    .implicitConstructorsForDeclaration(declaration);
  if (constructors === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      declaration,
      "Project class is absent from the canonical implicit-constructor model.",
    ));
    return [];
  }
  const safetyModifiers = csharpSafetyModifiersForDeclaration(
    declaration,
    "constructor",
    input,
  );
  return constructors.flatMap((constructor) => {
    publishCsharpProjectConstructorCallableContract(
      constructor,
      input,
      diagnostics,
    );
    return planForwardingConstructorOverloads(
      constructor,
      className,
      safetyModifiers,
      diagnostics,
    );
  });
}

function planForwardingConstructorOverloads(
  constructor: CsharpProjectForwardingConstructor,
  className: string,
  safetyModifiers: readonly CsharpModifier[],
  diagnostics: TargetDiagnostic[],
): readonly CsharpConstructorDeclaration[] {
  const variants = forwardingParameterVariants(
    constructor.targetMember.parameters,
  );
  if (variants === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      constructor.source.declaration ?? constructor.definition.declaration,
      "Implicit constructor parameters do not have one representable C# omission order.",
    ));
    return [];
  }
  return variants.flatMap((parameters) => {
    const planned = planForwardingParameters(
      parameters,
      constructor,
      diagnostics,
    );
    if (planned === undefined) {
      return [];
    }
    return [{
      kind: "ConstructorDeclaration" as const,
      name: className,
      modifiers: ["public" as const, ...safetyModifiers],
      parameters: planned.parameters,
      baseArguments: planned.baseArguments,
      body: { kind: "Block" as const, statements: [] },
    }];
  });
}

function forwardingParameterVariants(
  parameters: readonly CsharpTargetParameter[],
): readonly (readonly CsharpTargetParameter[])[] | undefined {
  const paramsIndex = parameters.findIndex((parameter) =>
    parameter.paramsArray === true);
  if (paramsIndex >= 0) {
    return paramsIndex === parameters.length - 1 &&
        parameters.slice(0, paramsIndex).every((parameter) =>
          parameter.csharpOmittableOptionalArgument !== true)
      ? [parameters]
      : undefined;
  }
  let requiredCount = parameters.length;
  while (
    requiredCount > 0 &&
    parameters[requiredCount - 1]
      ?.csharpOmittableOptionalArgument === true
  ) {
    requiredCount -= 1;
  }
  if (
    parameters.slice(0, requiredCount).some((parameter) =>
      parameter.csharpOmittableOptionalArgument === true)
  ) {
    return undefined;
  }
  const variants: (readonly CsharpTargetParameter[])[] = [];
  for (let count = requiredCount; count <= parameters.length; count += 1) {
    variants.push(parameters.slice(0, count));
  }
  return variants;
}

function planForwardingParameters(
  parameters: readonly CsharpTargetParameter[],
  constructor: CsharpProjectForwardingConstructor,
  diagnostics: TargetDiagnostic[],
):
  | {
      readonly parameters: readonly CsharpParameter[];
      readonly baseArguments: readonly CsharpArgument[];
    }
  | undefined {
  const plannedParameters: CsharpParameter[] = [];
  const baseArguments: CsharpArgument[] = [];
  for (const parameter of parameters) {
    const type = csharpTypeFromTargetTypeRef(parameter.type);
    const passing = csharpPassing(parameter.passingMode);
    if (type === undefined || passing.kind === "unsupported") {
      diagnostics.push(unsupportedNodeDiagnostic(
        constructor.source.declaration ?? constructor.definition.declaration,
        type === undefined
          ? `Implicit constructor parameter '${parameter.name}' has no renderable C# type.`
          : `Implicit constructor parameter '${parameter.name}' uses unsupported passing mode '${parameter.passingMode}'.`,
      ));
      return undefined;
    }
    const name = requireCsharpIdentifier(
      parameter.name,
      diagnostics,
      "Implicit constructor parameter",
    );
    plannedParameters.push({
      name,
      type,
      ...(passing.value === undefined ? {} : { passing: passing.value }),
      ...(parameter.paramsArray === true ? { isParams: true } : {}),
    });
    baseArguments.push({
      kind: "Argument",
      expression: { kind: "IdentifierName", name },
      ...(passing.value === undefined ? {} : { passing: passing.value }),
    });
  }
  return {
    parameters: Object.freeze(plannedParameters),
    baseArguments: Object.freeze(baseArguments),
  };
}

function csharpPassing(
  mode: CsharpTargetParameter["passingMode"],
):
  | { readonly kind: "resolved"; readonly value?: "in" | "out" | "ref" }
  | { readonly kind: "unsupported" } {
  switch (mode) {
    case "by-value":
      return { kind: "resolved" };
    case "byref-readonly":
      return { kind: "resolved", value: "in" };
    case "byref-readwrite":
      return { kind: "resolved", value: "ref" };
    case "byref-writeonly-must-init":
      return { kind: "resolved", value: "out" };
    case "borrow-shared":
    case "borrow-mut":
    case "move":
      return { kind: "unsupported" };
  }
}
