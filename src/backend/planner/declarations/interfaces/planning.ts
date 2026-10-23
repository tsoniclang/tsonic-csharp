import type { CsharpPlanningContext } from "../../context.js";
import { csharpObjectShapeArtifact } from "../../artifacts/object-shapes.js";
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
} from "../../types/index.js";
import { getExplicitReturnType } from "../callables/return-types.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import { planInterfaceHeritage } from "../classes/heritage.js";
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
import { renderCsharpStructuralInterfaceMethodValues } from "../../objects/structural-interfaces.js";
import { planCsharpNativeMemberHiding, planCsharpAdmittedMemberName } from "../modifiers.js";
import { renderObjectShapeProjectionMethods } from "../../objects/closed-object-shapes.js";
import {
  csharpSafetyAccessorModifiersForDeclaration,
  csharpSafetyModifiersForDeclaration,
} from "../../safety/explicit-safety.js";

export function planInterfaceDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpInterfaceDeclaration {
  const declaration = AsInterfaceDeclaration(input.program.source.ast, node);
  if (declaration === undefined) failCsharpPlannerInvariant("An admitted interface requires its checked source declaration.", node);
  const objectShape = getCsharpObjectShapeFactForNode(node, sourceFile, input);
  const interfaces = planInterfaceHeritage(node, input);
  const jsonSerializable = objectShape !== undefined && objectShapeRequiresJsonSerialization(input, objectShape);
  const members = (declaration.Members?.Nodes ?? []).flatMap((member): CsharpInterfaceMember[] => {
    if (member === undefined) failCsharpPlannerInvariant("An admitted interface requires a dense checked member list.", node);
    if (input.program.records.compileTimeMetadata.get(member)) {
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
  if (objectShape !== undefined && csharpObjectShapeArtifact(input, objectShape).capabilities.includes("method-values")) {
    const rendered = renderCsharpStructuralInterfaceMethodValues(input.scope.typeParameterNames, objectShape, input.program.records);
    if (rendered === undefined) failCsharpPlannerInvariant("An admitted interface method value lost its native callable storage.", node);
    members.push(...rendered);
  }
  return {
    kind: "InterfaceDeclaration",
    name: requiredName(declaration.name, input, node),
    modifiers: ["public", ...csharpSafetyModifiersForDeclaration(node, "declaration", input)],
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
        csharpObjectShapeArtifact(input, objectShape).projections, diagnostics))],
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
  const signature = input.program.records.callableDispatch.get(node);
  if (signature?.kind !== "method") failCsharpPlannerInvariant("An interface method requires its sealed source signature vector.", node);
  const parameters = planParametersWithPrelude(
    signature.implementation.parameters,
    sourceFile,
    input,
    diagnostics,
  );
  return {
    kind: "MethodDeclaration",
    name: planCsharpAdmittedMemberName(input.program.records, declaration.name),
    modifiers: [...planCsharpNativeMemberHiding(input.program.records.nativeMemberHiding, { kind: "source", declaration: node, role: "member" }), ...csharpSafetyModifiersForDeclaration(
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
    input, diagnostics,
  );
  const writable = !input.program.source.ast.hasModifierKind(node, "readonly");
  return {
    kind: "PropertyDeclaration",
    name: planCsharpAdmittedMemberName(input.program.records, declaration.name),
    modifiers: [...planCsharpNativeMemberHiding(input.program.records.nativeMemberHiding, { kind: "source", declaration: node, role: "member" }), ...csharpSafetyModifiersForDeclaration(
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
    keyName: requiredName(parameterDeclaration?.name, input, node),
    keyType: getCsharpTypeForNode(parameterDeclaration?.Type ?? parameterDeclaration?.name, sourceFile, input, diagnostics),
    valueType: getCsharpTypeForNode(declaration.Type, sourceFile, input, diagnostics),
  };
}

function requiredName(name: Node | undefined, input: CsharpPlanningContext, subject: Node): string {
  if (name === undefined) failCsharpPlannerInvariant("An admitted native interface member requires its checked source name.", subject);
  const selected = input.program.records.sourceName.get(name);
  if (selected.kind !== "resolved") failCsharpPlannerInvariant("An admitted native interface member requires its selected native name.", subject);
  return selected.name;
}
