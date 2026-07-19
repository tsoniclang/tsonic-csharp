import {
  structFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  SourceFile,
  StructFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
} from "../../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeNameText,
} from "../ast-utils.js";
import type {
  CsharpObjectShapeSemanticsHost,
} from "../object-shape-types.js";
import {
  sourceDeclarationTargetType,
} from "./target-type.js";

export function getCsharpSourceStructDeclarationTargetForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
): { readonly targetType: TargetTypeRef; readonly objectShape: CsharpObjectShapeFact } | undefined {
  const declaration = getCsharpSourceStructMarkerDeclarationForSubject(subject, context);
  const sourceFile = declaration === undefined ? undefined : context.compiler?.ast.getSourceFile(declaration);
  return declaration === undefined || sourceFile === undefined
    ? undefined
    : getStructTargetForDeclaration(context, sourceFile, declaration, host);
}

function getStructTargetForDeclaration(
  context: ExtensionObservationContext,
  sourceFile: SourceFile,
  declaration: Node,
  host: CsharpObjectShapeSemanticsHost,
): { readonly targetType: TargetTypeRef; readonly objectShape: CsharpObjectShapeFact } | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const structFact = getStructFactForDeclaration(context, declaration);
  if (structFact?.valueType !== true) {
    return undefined;
  }
  const name = getDeclarationNameText(compiler.ast, declaration);
  const targetType = sourceDeclarationTargetType(name, "KindStructMarkerDeclaration");
  if (targetType === undefined) {
    return undefined;
  }
  const members = getStructObjectShapeMembers(context, sourceFile, structFact, host);
  if (members === undefined) {
    return undefined;
  }
  return {
    targetType,
    objectShape: {
      targetType,
      members,
      constructible: true,
    },
  };
}

function getStructObjectShapeMembers(
  context: ExtensionObservationContext,
  sourceFile: SourceFile,
  structFact: StructFact,
  host: CsharpObjectShapeSemanticsHost,
): readonly CsharpObjectShapeMemberFact[] | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const members = (structFact.fields ?? []).map((field): CsharpObjectShapeMemberFact | undefined => {
    const type = host.getTargetTypeRefForSubject(field.type, context, {
      allowRuntimeCarrier: false,
      allowSemanticTypeQuery: true,
      sourceFile,
    });
    return type === undefined
      ? undefined
      : {
          sourceName: field.name,
          targetName: field.name,
          memberKind: "property",
          type,
          ...(field.readonly === true ? { readonly: true as const } : {}),
        };
  });
  return members.some((member) => member === undefined)
    ? undefined
    : members as readonly CsharpObjectShapeMemberFact[];
}

function getCsharpSourceStructMarkerDeclarationForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): Node | undefined {
  const compiler = context.compiler;
  const node = asNodeSubject(subject);
  if (compiler === undefined || node === undefined) {
    return undefined;
  }
  if (compiler.ast.kindName(node) === "KindVariableDeclaration" && getStructFactForDeclaration(context, node)?.valueType === true) {
    return node;
  }
  return undefined;
}

function getStructFactForDeclaration(
  context: ExtensionObservationContext,
  declaration: Node,
): StructFact | undefined {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return undefined;
  }
  const direct = context.facts.get(declaration, structFactKey) ??
    context.factResolver.resolve(declaration, structFactKey);
  if (direct?.valueType === true) {
    return direct;
  }
  const initializer = asNodeSubject(getNodeField(declaration, "Initializer"));
  const callFact = initializer === undefined ? undefined : context.facts.get(initializer, structFactKey) ??
    context.factResolver.resolve(initializer, structFactKey);
  if (callFact?.valueType === true) {
    return callFact;
  }
  return undefined;
}

function getDeclarationNameText(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  declaration: Node,
): string {
  const name = asNodeSubject(getNodeField(declaration, "name")) ?? ast.name(declaration);
  return name === undefined ? getNodeNameText(ast, declaration) : ast.text(name);
}
