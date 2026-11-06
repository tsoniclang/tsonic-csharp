import type { Node } from "@tsonic/tsts";
import { sourceEnclosingCallable, sourceTransparentExpressionOperand } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import { sourceOperatorFromKindName } from "../../target-model/syntax/operators.js";

export function csharpConversionAnnotationHint(
  policy: CsharpPolicyContext,
  operations: Pick<CsharpTargetOperationClassifications, "selectedCall" | "selectedConstruction">,
  expression: Node,
): string | undefined {
  const { ast, navigation } = policy;
  let current = expression;
  let parent = ast.parent(current);
  while (parent !== undefined && sourceTransparentExpressionOperand(ast, parent) === current) {
    current = parent;
    parent = ast.parent(current);
  }
  if (parent === undefined) return undefined;
  let declaration = navigation.referenceFor(current)?.declaration;
  let annotation: Node | undefined;
  const assignment = ast.is.IsBinaryExpression(parent) && sourceOperatorFromKindName(ast.operatorKindName(parent)) === "="
    ? ast.as.AsBinaryExpression(parent) : undefined;
  if (assignment?.Right === current && assignment.Left !== undefined) {
    annotation = declaration === undefined ? undefined : ast.typeNode(declaration);
    declaration = navigation.referenceFor(assignment.Left)?.declaration;
  } else if (ast.is.IsReturnStatement(parent)) {
    const callable = sourceEnclosingCallable(parent, ast);
    annotation = callable === undefined ? undefined : ast.typeNode(callable);
  } else if (ast.is.IsCallExpression(parent) || ast.is.IsNewExpression(parent)) {
    const construction = ast.is.IsNewExpression(parent) ? operations.selectedConstruction.get(parent)?.target : undefined;
    const call = ast.is.IsCallExpression(parent) ? operations.selectedCall.get(parent)?.source
      : construction?.kind === "resolved" || construction?.kind === "source-owned" ? construction.source : undefined;
    const argumentIndex = call?.sourceArguments.findIndex(argument => argument.expression === current);
    const bindings = argumentIndex === undefined || argumentIndex < 0 ? []
      : call?.sourceArgumentBindings.filter(binding => binding.sourceArgumentIndex === argumentIndex) ?? [];
    const parameters = new Set(bindings.map(binding => binding.sourceParameterIndex));
    const parameter = parameters.size === 1 ? call?.sourceSelectedSignatureParameters[bindings[0]!.sourceParameterIndex]?.parameterDeclaration : undefined;
    annotation = parameter === undefined ? undefined : ast.typeNode(parameter);
  }
  if (declaration === undefined || annotation === undefined || !ast.is.IsVariableDeclaration(declaration) ||
    ast.typeNode(declaration) !== undefined) return undefined;
  const name = ast.name(declaration);
  const initializer = ast.as.AsVariableDeclaration(declaration)?.Initializer;
  const kind = ast.variableDeclarationKind(declaration);
  if (name === undefined || !ast.is.IsIdentifier(name) || initializer === undefined || kind === undefined) return undefined;
  const annotationFile = ast.getSourceFile(annotation);
  const initializerFile = ast.getSourceFile(initializer);
  if (annotationFile === undefined || initializerFile === undefined) return undefined;
  const annotationText = String(ast.getSourceText(annotationFile)).slice(ast.pos(annotation), ast.end(annotation))
    .trim().replace(/^readonly\s+(?=.+\[\]$)/u, "");
  const initializerText = String(ast.getSourceText(initializerFile)).slice(ast.pos(initializer), ast.end(initializer)).trim();
  if (annotationText.length > 120 || initializerText.length > 120) return undefined;
  return `Annotate \`${kind} ${ast.text(name)}: ${annotationText} = ${initializerText}\`.`;
}
