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
} from "../../../target-ast/roslyn/index.js";
import { planAttributesForSubject } from "../attributes.js";
import {
  getCsharpTypeForNode,
  invalidCsharpType,
} from "../../types/index.js";
import { getExplicitReturnType } from "../callables/return-types.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { planInterfaceHeritage } from "../classes/heritage.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers } from "../modifiers.js";
import { planIdentifierName } from "../../names/source-identifiers.js";
import {
  planParametersWithPrelude,
} from "../callables/parameters.js";
import { planTypeParameters } from "../../types/type-parameters.js";
import {
  csharpJsonValueInterfaceType,
  objectShapeRequiresJsonSerialization,
} from "../../objects/json-object-shapes.js";
import {
  getCsharpObjectShapeFactForNode,
} from "../../objects/fact-queries.js";
import {
  registerSourceObjectShape,
} from "../../objects/index.js";
import { csharpInheritedStructuralInterfaces, renderCsharpStructuralInterfaceMembers, shadowCsharpInheritedInterfaceMembers } from "../../objects/declarations/structural-interfaces.js";
import { objectShapeStorageMemberName } from "../../objects/object-shape-storage.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../../target-model/types/object-shape-members.js";
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
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.program.source.ast, node, "interface declaration", diagnostics);
  const objectShape = getCsharpObjectShapeFactForNode(node, sourceFile, input);
  const interfaces = planInterfaceHeritage(node, objectShape, input, diagnostics);
  if (objectShape !== undefined) {
    registerSourceObjectShape(input, objectShape, diagnostics, node);
    if (objectShape.members.some(member => member.memberKind === "method" && member.optional === true)) {
      const selected = input.artifacts.requireObjectShapeCapability(undefined, objectShape.targetType, sourceFile, "method-values", "object-shape");
      if (selected.kind === "rejected") diagnostics.push(unsupportedNodeDiagnostic(node, selected.reason));
    }
  }
  const jsonSerializable = objectShape !== undefined && objectShapeRequiresJsonSerialization(input, objectShape);
  const members = (declaration.Members?.Nodes ?? []).flatMap((member): CsharpInterfaceMember[] => {
    if (member === undefined) {
      return [];
    }
    switch (input.program.source.ast.kindName(member)) {
      case KindMethodSignature: {
        const selected = objectShape === undefined ? undefined : resolveCsharpObjectShapeMemberBySelectedSubject(objectShape, [member]);
        return selected?.kind === "resolved" && selected.member.optional === true
          ? [] : [planInterfaceMethodDeclaration(member, sourceFile, input, diagnostics)];
      }
      case KindPropertySignature:
        return [planInterfacePropertyDeclaration(member, sourceFile, input, diagnostics)];
      case KindIndexSignature:
        return [planInterfaceIndexerDeclaration(member, sourceFile, input, diagnostics)];
      default:
        diagnostics.push(unsupportedNodeDiagnostic(member, "Interface member is outside the current C# planning surface."));
        return [];
    }
  });
  const inherited = objectShape === undefined ? [] : csharpInheritedStructuralInterfaces(objectShape, input);
  if (objectShape !== undefined && input.artifacts.objectShapeHasCapability(objectShape, "method-values")) {
    const storageNames = new Set(objectShape.members.filter(member => member.memberKind === "method")
      .map(member => objectShapeStorageMemberName(objectShape, member)));
    const rendered = renderCsharpStructuralInterfaceMembers(input.scope.typeParameterNames, objectShape, input.program.storage, true, inherited);
    if (rendered === undefined) diagnostics.push(unsupportedNodeDiagnostic(node, "An interface method value requires its exact native callable storage contract."));
    else members.push(...rendered.filter(member => member.kind === "PropertyDeclaration" && storageNames.has(member.name)));
  }
  const inheritedMembers = inherited.flatMap(parent => {
    const rendered = renderCsharpStructuralInterfaceMembers(input.scope.typeParameterNames, parent.shape, input.program.storage, parent.methodValues, []);
    if (rendered === undefined) diagnostics.push(unsupportedNodeDiagnostic(node, "An inherited interface requires exact native member signatures."));
    return rendered ?? [];
  });
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
    members: [...shadowCsharpInheritedInterfaceMembers(members, inheritedMembers),
      ...(objectShape === undefined ? [] : renderObjectShapeProjectionMethods(input, objectShape,
        input.artifacts.objectShapeProjections(objectShape), diagnostics))],
  };
}

function planInterfaceMethodDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpInterfaceMethodDeclaration {
  const declaration = AsMethodSignatureDeclaration(input.program.source.ast, node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.program.source.ast, node, "interface method declaration", diagnostics);
  const parameters = planParametersWithPrelude(
    declaration.Parameters?.Nodes ?? [],
    sourceFile,
    input,
    diagnostics,
  );
  if (parameters.prelude.length > 0) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Interface methods cannot publish destructuring parameter preludes.",
    ));
  }
  return {
    kind: "MethodDeclaration",
    name: planIdentifierName(declaration.name, "MethodDeclaration", input, diagnostics, "Interface method name"),
    modifiers: csharpSafetyModifiersForDeclaration(
      node,
      "declaration",
      input,
    ),
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
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(
    input.program.source.ast,
    node,
    "interface property declaration",
    diagnostics,
    ["readonly"],
  );
  if (declaration.Initializer !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Interface property initializers have no direct C# interface equivalent."));
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
    name: planIdentifierName(declaration.name, "PropertyDeclaration", input, diagnostics, "Interface property name"),
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
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(
    input.program.source.ast,
    node,
    "interface index signature",
    diagnostics,
    ["readonly"],
  );
  const parameterNodes = declaration.Parameters?.Nodes ?? [];
  const parameterNode = parameterNodes.find((item): item is Node => item !== undefined);
  if (parameterNode === undefined || parameterNodes.filter((item) => item !== undefined).length !== 1) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Interface index signature requires exactly one key parameter."));
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
