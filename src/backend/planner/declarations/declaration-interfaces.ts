import type { CsharpPlanningContext } from "../context.js";
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
} from "../../roslyn/syntax.js";
import { planAttributesForSubject } from "./attributes.js";
import {
  getCsharpTypeForNode,
  invalidCsharpType,
  nullableCsharpType,
} from "../types/index.js";
import {
  getDeclarationReturnTargetType,
  getExplicitReturnType,
} from "./declaration-return-types.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { planInterfaceHeritage } from "./heritage.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers } from "./modifiers.js";
import { planIdentifierName } from "../names/source-identifiers.js";
import {
  planParametersWithPrelude,
} from "../bindings/parameters.js";
import { planTypeParameters } from "../types/type-parameters.js";
import {
  csharpJsonValueInterfaceType,
  objectShapeRequiresJsonSerialization,
} from "../objects/json-object-shapes.js";
import {
  getCsharpObjectShapeFactForNode,
} from "../objects/fact-queries.js";
import {
  registerSourceObjectShape,
} from "../objects/index.js";
import {
  publishCsharpSourceCallableContract,
} from "../artifacts/source-callable-contracts.js";
import {
  csharpSafetyAccessorModifiersForDeclaration,
  csharpSafetyModifiersForDeclaration,
  diagnoseUnavailableCsharpSafetyAccessors,
} from "../safety/explicit-safety.js";

export function planInterfaceDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpInterfaceDeclaration {
  const declaration = AsInterfaceDeclaration(input.ast, node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.ast, node, "interface declaration", diagnostics);
  const interfaces = planInterfaceHeritage(node, input, diagnostics);
  const objectShape = getCsharpObjectShapeFactForNode(node, sourceFile, input);
  if (objectShape !== undefined) {
    registerSourceObjectShape(input, objectShape, diagnostics, node);
  }
  const jsonSerializable = objectShape !== undefined && objectShapeRequiresJsonSerialization(input, objectShape);
  const members = (declaration.Members?.Nodes ?? []).flatMap((member): CsharpInterfaceMember[] => {
    if (member === undefined) {
      return [];
    }
    switch (input.ast.kindName(member)) {
      case KindMethodSignature:
        return [planInterfaceMethodDeclaration(member, sourceFile, input, diagnostics)];
      case KindPropertySignature:
        return [planInterfacePropertyDeclaration(member, sourceFile, input, diagnostics)];
      case KindIndexSignature:
        return [planInterfaceIndexerDeclaration(member, sourceFile, input, diagnostics)];
      default:
        diagnostics.push(unsupportedNodeDiagnostic(member, "Interface member is outside the current C# planning surface."));
        return [];
    }
  });
  return {
    kind: "InterfaceDeclaration",
    name: planIdentifierName(declaration.name, "AnonymousInterface", input, diagnostics, "Interface name"),
    modifiers: ["public"],
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], sourceFile, input, diagnostics),
    ...(interfaces.length === 0 && !jsonSerializable
      ? {}
      : {
          interfaces: [
            ...interfaces,
            ...(jsonSerializable ? [csharpJsonValueInterfaceType()] : []),
          ],
        }),
    members,
  };
}

function planInterfaceMethodDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpInterfaceMethodDeclaration {
  const declaration = AsMethodSignatureDeclaration(input.ast, node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.ast, node, "interface method declaration", diagnostics);
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
  const returnTargetType = getDeclarationReturnTargetType(
    declaration.Type,
    node,
    sourceFile,
    input,
  );
  publishCsharpSourceCallableContract(
    node,
    parameters.targetParameters,
    returnTargetType,
    input,
    diagnostics,
  );
  return {
    kind: "MethodDeclaration",
    name: planIdentifierName(declaration.name, "MethodDeclaration", input, diagnostics, "Interface method name"),
    modifiers: csharpSafetyModifiersForDeclaration(
      node,
      "declaration",
      input,
    ),
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], sourceFile, input, diagnostics),
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
  const declaration = AsPropertySignatureDeclaration(input.ast, node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(
    input.ast,
    node,
    "interface property declaration",
    diagnostics,
    ["readonly"],
  );
  if (declaration.Initializer !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Interface property initializers have no direct C# interface equivalent."));
  }
  const type = getCsharpTypeForNode(
    declaration.Type ?? declaration.name,
    sourceFile,
    input,
    invalidCsharpType("interface property type"),
    diagnostics,
  );
  const writable = !input.ast.hasModifierKind(node, "readonly");
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
    type: input.ast.questionToken(node) === undefined
      ? type
      : nullableCsharpType(type),
  };
}

function planInterfaceIndexerDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpInterfaceIndexerDeclaration {
  const declaration = AsIndexSignatureDeclaration(input.ast, node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(
    input.ast,
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
  const parameterDeclaration = parameterNode === undefined ? undefined : AsParameterDeclaration(input.ast, parameterNode);
  const writable = !input.ast.hasModifierKind(node, "readonly");
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
