import type { CsharpPlanningContext } from "../context.js";
import {
  AsClassDeclaration,
  AsFunctionDeclaration,
  AsInterfaceDeclaration,
  AsPropertySignatureDeclaration,
  KindInterfaceDeclaration,
  KindPropertySignature,
  SourceKind,
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpClassDeclaration,
  CsharpMethodDeclaration,
} from "../../target-ast/roslyn/index.js";
import { planAttributesForSubject } from "./attributes.js";
import {
  createDestructuringPlannerState,
} from "../bindings/index.js";
import { planClassHeritage } from "./heritage.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers, isAsyncNode } from "./modifiers.js";
import { planIdentifierName } from "../names/source-identifiers.js";
import { planParametersWithPrelude } from "../bindings/parameters.js";
import { planBlockStatements } from "../statements/index.js";
import { planTypeParameters } from "../types/type-parameters.js";
import {
  getAsyncReturnExpressionExpectedType,
  getDeclarationReturnTargetType,
  getExplicitReturnType,
} from "./declaration-return-types.js";
import {
  planClassMembers,
} from "./declaration-class-members.js";
import {
  csharpJsonValueInterfaceType,
  objectShapeRequiresJsonSerialization,
  renderJsonSerializableObjectShapeMethod,
} from "../objects/json-object-shapes.js";
import {
  getCsharpObjectShapeFactForNode,
} from "../objects/fact-queries.js";
import {
  registerSourceObjectShape,
} from "../objects/index.js";
import {
  planImplicitForwardingConstructors,
} from "../project/type-constructors.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  hasCsharpGeneratorSyntax,
  planCsharpGeneratorFunction,
} from "../statements/generators.js";
import {
  csharpSafetyModifiersForDeclaration,
  withCsharpSafetyModifiers,
} from "../safety/explicit-safety.js";

export { planEnumDeclaration } from "./declaration-enums.js";
export { planInterfaceDeclaration } from "./declaration-interfaces.js";

export function planClassDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpClassDeclaration {
  const declaration = AsClassDeclaration(input.program.source.ast, node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.program.source.ast, node, "class declaration", diagnostics);
  const className = planIdentifierName(declaration.name, "AnonymousClass", input, diagnostics, "Class name");
  const heritage = planClassHeritage(node, input, diagnostics);
  const autoPropertyNames = getImplementedInterfacePropertyNames(node, input);
  const objectShape = getCsharpObjectShapeFactForNode(node, sourceFile, input);
  if (objectShape !== undefined) {
    registerSourceObjectShape(input, objectShape, diagnostics, node);
  }
  const jsonSerializable = objectShape !== undefined && objectShapeRequiresJsonSerialization(input, objectShape);
  const members = planClassMembers(declaration.Members?.Nodes ?? [], className, autoPropertyNames, sourceFile, input, diagnostics);
  const implicitConstructors = planImplicitForwardingConstructors(
    node,
    className,
    input,
    diagnostics,
  );
  const safetyDefaultConstructors = members.some((member) =>
      member.kind === "ConstructorDeclaration") ||
      implicitConstructors.length > 0
    ? []
    : defaultSafetyConstructors(node, className, input);
  return {
    kind: "ClassDeclaration",
    name: className,
    modifiers: ["public"],
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], input, diagnostics),
    ...(heritage.baseType === undefined ? {} : { baseType: heritage.baseType }),
    ...(heritage.interfaces.length === 0 && !jsonSerializable
      ? {}
      : {
          interfaces: [
            ...heritage.interfaces,
            ...(jsonSerializable ? [csharpJsonValueInterfaceType()] : []),
          ],
        }),
    members: [
      ...implicitConstructors,
      ...safetyDefaultConstructors,
      ...members,
      ...(jsonSerializable && objectShape !== undefined
        ? renderJsonSerializableObjectShapeMethod(objectShape)
        : []),
    ],
  };
}

function defaultSafetyConstructors(
  declaration: Node,
  className: string,
  input: CsharpPlanningContext,
): CsharpClassDeclaration["members"] {
  const safetyModifiers = csharpSafetyModifiersForDeclaration(
    declaration,
    "constructor",
    input,
  );
  return safetyModifiers.length === 0
    ? []
    : [{
        kind: "ConstructorDeclaration",
        name: className,
        modifiers: ["public", ...safetyModifiers],
        parameters: [],
        body: { kind: "Block", statements: [] },
      }];
}

function getImplementedInterfacePropertyNames(
  classDeclaration: Node,
  input: CsharpPlanningContext,
): ReadonlySet<string> {
  const names = new Set<string>();
  const heritage = input.program.sourceNavigation.declaredHeritage(classDeclaration);
  if (heritage.kind !== "resolved") {
    return names;
  }
  for (const edge of heritage.edges) {
    if (edge.kind === "implements") {
      collectImplementedInterfacePropertyNames(
        edge.target.declaration,
        input,
        names,
        new Set<Node>(),
      );
    }
  }
  return names;
}

function collectImplementedInterfacePropertyNames(
  declaration: Node,
  input: CsharpPlanningContext,
  names: Set<string>,
  seen: Set<Node>,
): void {
  if (seen.has(declaration) || SourceKind(input.program.source.ast, declaration) !== KindInterfaceDeclaration) {
    return;
  }
  seen.add(declaration);
  const interfaceDeclaration = AsInterfaceDeclaration(input.program.source.ast, declaration);
  if (interfaceDeclaration === undefined) {
    return;
  }
  for (const member of interfaceDeclaration.Members?.Nodes ?? []) {
    if (SourceKind(input.program.source.ast, member) !== KindPropertySignature) {
      continue;
    }
    const property = AsPropertySignatureDeclaration(input.program.source.ast, member);
    const name = property?.name === undefined ? undefined : planIdentifierName(property.name, "PropertyDeclaration", input, [], "Interface property name");
    if (name !== undefined) {
      names.add(name);
    }
  }
  const heritage = input.program.sourceNavigation.declaredHeritage(declaration);
  if (heritage.kind !== "resolved") {
    return;
  }
  for (const edge of heritage.edges) {
    if (edge.kind === "extends") {
      collectImplementedInterfacePropertyNames(
        edge.target.declaration,
        input,
        names,
        seen,
      );
    }
  }
}

export function planFunctionDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpMethodDeclaration {
  const declaration = AsFunctionDeclaration(input.program.source.ast, node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.program.source.ast, node, "function declaration", diagnostics);
  const name = planIdentifierName(declaration.name, "__anonymous", input, diagnostics, "Function name");
  const state = createDestructuringPlannerState(node, input.program.source.ast);
  const parameters = planParametersWithPrelude(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state);
  const declaredReturnTargetType = getDeclarationReturnTargetType(
    declaration.Type,
    node,
    sourceFile,
    input,
  );
  const declaredReturnType = getExplicitReturnType(declaration.Type, node, "function declaration", sourceFile, input, diagnostics);
  const generatorSyntax = hasCsharpGeneratorSyntax(node, input);
  if (generatorSyntax) {
    const generator = planCsharpGeneratorFunction(
      node,
      declaration.Body,
      sourceFile,
      input,
      diagnostics,
      state,
      parameters.prelude,
      planBlockStatements,
    );
    return {
      kind: "MethodDeclaration",
      name,
      modifiers: withCsharpSafetyModifiers(
        ["public", "static"],
        node,
        "declaration",
        input,
      ),
      attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
      typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], input, diagnostics),
      returnType: generator?.generatorTypeNode ?? declaredReturnType,
      parameters: parameters.parameters,
      body: generator?.body ?? { kind: "Block", statements: [] },
    };
  }
  const async = isAsyncNode(input.program.source.ast, node);
  state.currentReturnType = declaredReturnType;
  state.currentReturnTypeSubject = declaration.Type;
  if (async) {
    const returnExpressionType = getAsyncReturnExpressionExpectedType(declaration.Type, node, "function declaration", sourceFile, input, diagnostics);
    state.currentReturnExpressionType = returnExpressionType?.type;
    state.currentReturnExpressionTypeSubject = returnExpressionType?.subject;
    state.currentReturnExpressionTargetType = returnExpressionType?.targetType;
  }
  const returnContract = input.program.declarations.returnContract(node);
  state.currentUndefinedReturn = returnContract?.kind === "resolved" && returnContract.undefinedReturn === true;
  const bodyStatements = planBlockStatements(
    declaration.Body,
    sourceFile,
    input,
    diagnostics,
    state,
  );
  if (returnContract?.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      returnContract.reason,
    ));
  }
  const effectiveReturnTargetType = returnContract?.kind === "resolved"
    ? returnContract.type
    : declaredReturnTargetType;
  const returnType = effectiveReturnTargetType === undefined
    ? declaredReturnType
    : csharpTypeFromTargetTypeRef(effectiveReturnTargetType) ??
      declaredReturnType;
  return {
    kind: "MethodDeclaration",
    name,
    modifiers: withCsharpSafetyModifiers(
      async ? ["public", "static", "async"] : ["public", "static"],
      node,
      "declaration",
      input,
    ),
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], input, diagnostics),
    returnType,
    parameters: parameters.parameters,
    body: {
      kind: "Block",
      statements: [
        ...parameters.prelude,
        ...bodyStatements,
        ...(returnContract?.kind === "resolved" && returnContract.fallthroughUndefined
          ? [{ kind: "ReturnStatement" as const, expression: { kind: "LiteralExpression" as const, value: null } }] : []),
      ],
    },
  };
}
