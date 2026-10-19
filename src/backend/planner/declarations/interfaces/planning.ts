import type { CsharpPlanningContext } from "../../context.js";
import {
  AsIndexSignatureDeclaration,
  AsInterfaceDeclaration,
  AsMethodSignatureDeclaration,
  AsParameterDeclaration,
  AsPropertySignatureDeclaration,
  KindIndexSignature,
  KindMethodSignature,
  KindPropertySignature,
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpInterfaceDeclaration,
  CsharpInterfaceIndexerDeclaration,
  CsharpInterfaceMember,
  CsharpInterfaceMethodDeclaration,
  CsharpInterfacePropertyDeclaration,
} from "../../../target-ast/syntax/index.js";
import { planAttributesForSubject } from "../attributes.js";
import {
  getCsharpTypeForNode,
  invalidCsharpType,
} from "../../types/index.js";
import { getExplicitReturnType } from "../callables/return-types.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import { planInterfaceHeritage } from "../classes/heritage.js";
import { planIdentifierName } from "../../names/source-identifiers.js";
import {
  planParametersWithPrelude,
} from "../callables/parameters.js";
import { planTypeParameters } from "../../types/type-parameters.js";
import { createCsharpTypeParameterPlanningContext } from "../../names/type-parameters.js";
import {
  csharpJsonValueInterfaceType,
  objectShapeRequiresJsonSerialization,
} from "../../objects/json-object-shapes.js";
import {
  getCsharpObjectShapeFactForNode,
} from "../../objects/fact-queries.js";
import { csharpInheritedStructuralInterfaces, renderCsharpStructuralInterfaceMethodValues } from "../../objects/declarations/structural-interfaces.js";
import { planCsharpNativeMemberHiding, planCsharpAdmittedMemberName } from "../modifiers.js";
import { renderObjectShapeProjectionMethods } from "../../objects/closed-object-shapes.js";
import {
  csharpSafetyAccessorModifiersForDeclaration,
  csharpSafetyModifiersForDeclaration,
  diagnoseUnavailableCsharpSafetyAccessors,
} from "../../safety/explicit-safety.js";

export function planInterfaceDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpInterfaceDeclaration {
  const declaration = AsInterfaceDeclaration(input.program.source.ast, node)!;
  const objectShape = getCsharpObjectShapeFactForNode(node, sourceFile, input);
  const interfaces = planInterfaceHeritage(node, input);
  const jsonSerializable = objectShape !== undefined && objectShapeRequiresJsonSerialization(input, objectShape);
  const members = (declaration.Members?.Nodes ?? []).flatMap((member): CsharpInterfaceMember[] => {
    if (member === undefined || input.program.records.compileTimeMetadata.get(member)) {
      return [];
    }
    switch (input.program.source.ast.kindName(member)) {
      case KindMethodSignature: {
        return input.program.records.nativeParticipation.get(member) === "signature"
          ? [planInterfaceMethodDeclaration(member, sourceFile, input, diagnostics)] : [];
      }
      case KindPropertySignature:
        return [planInterfacePropertyDeclaration(member, sourceFile, input, diagnostics)];
      case KindIndexSignature:
        return [planInterfaceIndexerDeclaration(member, sourceFile, input, diagnostics)];
      default:
        return failCsharpPlannerInvariant("An admitted interface member lost its native declaration form.", member);
    }
  });
  const inherited = objectShape === undefined ? [] : csharpInheritedStructuralInterfaces(objectShape, input);
  if (objectShape !== undefined && input.artifacts.objectShapeHasCapability(objectShape, "method-values")) {
    const rendered = renderCsharpStructuralInterfaceMethodValues(input.scope.typeParameterNames, objectShape, inherited, input.program.names);
    if (rendered === undefined) failCsharpPlannerInvariant("An admitted interface method value lost its native callable storage.", node);
    members.push(...rendered);
  }
  return {
    kind: "InterfaceDeclaration",
    name: planIdentifierName(declaration.name, "AnonymousInterface", input, diagnostics, "Interface name"),
    modifiers: ["public"],
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], input, diagnostics),
    ...(interfaces.length === 0 && !jsonSerializable
      ? {}
      : {
          interfaces: [
            ...interfaces,
            ...(jsonSerializable ? [csharpJsonValueInterfaceType()] : []),
          ],
        }),
    members: [...members,
      ...(objectShape === undefined ? [] : renderObjectShapeProjectionMethods(input,
        input.artifacts.objectShapeProjections(objectShape), diagnostics))],
  };
}

function planInterfaceMethodDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpInterfaceMethodDeclaration {
  input = createCsharpTypeParameterPlanningContext(node, input);
  const declaration = AsMethodSignatureDeclaration(input.program.source.ast, node)!;
  const parameters = planParametersWithPrelude(
    declaration.Parameters?.Nodes ?? [],
    sourceFile,
    input,
    diagnostics,
  );
  return {
    kind: "MethodDeclaration",
    name: planCsharpAdmittedMemberName(input.program.names, declaration.name),
    modifiers: [...planCsharpNativeMemberHiding(input.program.names, { kind: "source", declaration: node, role: "member" }), ...csharpSafetyModifiersForDeclaration(
      node,
      "declaration",
      input,
    )],
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], input, diagnostics),
    returnType: getExplicitReturnType(declaration.Type, node, "interface method declaration", sourceFile, input, diagnostics),
    parameters: parameters.parameters,
  };
}

function planInterfacePropertyDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpInterfacePropertyDeclaration {
  const declaration = AsPropertySignatureDeclaration(input.program.source.ast, node)!;
  if (declaration.Initializer !== undefined) {
    failCsharpPlannerInvariant("An admitted interface property unexpectedly retained an initializer.", node);
  }
  const type = getCsharpTypeForNode(
    node,
    sourceFile,
    input,
    invalidCsharpType("interface property type"),
    diagnostics,
  );
  const writable = !input.program.source.ast.hasModifierKind(node, "readonly");
  diagnoseUnavailableCsharpSafetyAccessors(
    node,
    writable ? ["getter", "setter"] : ["getter"],
    input,
    diagnostics,
  );
  return {
    kind: "PropertyDeclaration",
    name: planCsharpAdmittedMemberName(input.program.names, declaration.name),
    modifiers: [...planCsharpNativeMemberHiding(input.program.names, { kind: "source", declaration: node, role: "member" }), ...csharpSafetyModifiersForDeclaration(
      node,
      "declaration",
      input,
    )],
    getterModifiers: csharpSafetyAccessorModifiersForDeclaration(
      node,
      "getter",
      input,
    ),
    setterModifiers: csharpSafetyAccessorModifiersForDeclaration(
      node,
      "setter",
      input,
    ),
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    writable,
    type,
  };
}

function planInterfaceIndexerDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpInterfaceIndexerDeclaration {
  const declaration = AsIndexSignatureDeclaration(input.program.source.ast, node)!;
  const parameterNodes = declaration.Parameters?.Nodes ?? [];
  const parameterNode = parameterNodes.find((item): item is Node => item !== undefined);
  if (parameterNode === undefined || parameterNodes.filter((item) => item !== undefined).length !== 1) {
    return failCsharpPlannerInvariant("A checked interface index signature requires exactly one key parameter.", node);
  }
  const parameterDeclaration = parameterNode === undefined ? undefined : AsParameterDeclaration(input.program.source.ast, parameterNode);
  const writable = !input.program.source.ast.hasModifierKind(node, "readonly");
  diagnoseUnavailableCsharpSafetyAccessors(
    node,
    writable ? ["getter", "setter"] : ["getter"],
    input,
    diagnostics,
  );
  return {
    kind: "IndexerDeclaration",
    modifiers: csharpSafetyModifiersForDeclaration(
      node,
      "declaration",
      input,
    ),
    getterModifiers: csharpSafetyAccessorModifiersForDeclaration(
      node,
      "getter",
      input,
    ),
    setterModifiers: csharpSafetyAccessorModifiersForDeclaration(
      node,
      "setter",
      input,
    ),
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    writable,
    keyName: planIdentifierName(parameterDeclaration?.name, "key", input, diagnostics, "Interface indexer key name"),
    keyType: getCsharpTypeForNode(parameterDeclaration?.Type ?? parameterDeclaration?.name, sourceFile, input, undefined, diagnostics),
    valueType: getCsharpTypeForNode(declaration.Type, sourceFile, input, undefined, diagnostics),
  };
}
