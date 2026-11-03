import type { Node } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import { nextState } from "../../source-evidence/types/resolution/state.js";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import { formSelectedObjectShapeSource, type CsharpObjectShapeSourceFormation } from "./source-evidence.js";
import type { createCsharpObjectShapeSourceFormation, CsharpObjectShapeTypeSource } from "./type-source.js";

export interface CsharpObjectShapeNodeSource {
  readonly node: Node;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly nativeState: CsharpTypeResolutionState;
  readonly selection: CsharpObjectShapeSourceFormation;
  readonly semantic: CsharpObjectShapeTypeSource | undefined;
  readonly contextual: CsharpObjectShapeTypeSource | undefined;
  readonly classDeclaration: boolean;
  readonly objectLiteral: boolean;
}

export function formCsharpObjectShapeNodeSource(
  host: CsharpObjectShapePolicyHost,
  formation: ReturnType<typeof createCsharpObjectShapeSourceFormation>,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpObjectShapeNodeSource | undefined {
  if (host.ast.is.IsSourceFile(node) || host.ast.is.IsImportDeclaration(node) ||
    host.ast.is.IsImportClause(node) || host.ast.kindName(node) === "KindEndOfFile") return undefined;
  const selection = formSelectedObjectShapeSource(node, queries, host, state);
  const declaration = host.navigation.declarationFor(node);
  const authoredTypeRoot = declaration === undefined ? undefined : host.ast.typeNode(declaration);
  const formType = (type: CsharpObjectShapeSourceFormation["type"]) => type === undefined ? undefined
    : formation.formTypeSource(type, node, queries, state, authoredTypeRoot,
      host.projectSemanticSource(type, queries, state));
  const semantic = formType(selection.type);
  const contextualType = selection.contextual?.component.selectedType;
  const contextual = contextualType === selection.type ? semantic : formType(contextualType);
  return Object.freeze({ node, queries, state, nativeState: Object.freeze(nextState(state)), selection, semantic, contextual,
    classDeclaration: host.ast.is.IsClassDeclaration(node) || host.ast.is.IsClassExpression(node),
    objectLiteral: host.ast.is.IsObjectLiteralExpression(node),
  });
}
