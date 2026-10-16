import type { Node, SourceFile } from "@tsonic/tsts";
import { IsTypeSyntaxNode, sourceClassFieldIsTypeOnly } from "@tsonic/target-api/source";
import type { CsharpAttributeApplicationIndex } from "../../../target-model/records/attributes.js";
import type { CsharpClassInitializationIndex } from "../../../target-model/records/class-initialization.js";
import type { CsharpNativeParticipationInput } from "../../../target-model/records/native-demand.js";
import type { CsharpProjectTypeClassifications } from "../../../target-model/records/project-types.js";
import { csharpNativeChildUses, isCsharpNativeExpression, type CsharpNativeOperandInput, type CsharpNativeOperandStep } from "./operands.js";

export interface CsharpNativeConstructInput extends CsharpNativeOperandInput, CsharpNativeParticipationInput {
  readonly sourceFiles: readonly SourceFile[];
  readonly attributeApplications: CsharpAttributeApplicationIndex;
  readonly classInitialization: Pick<CsharpClassInitializationIndex, "classInitializationRegion">;
  readonly projectTypes: Pick<CsharpProjectTypeClassifications, "definitionContainingDeclaration">;
  readonly baseCalls: { readonly get: (constructor: Node) => Node | undefined };
  readonly unusedDefault: { readonly get: (initializer: Node) => boolean };
}

export function selectCsharpNativeConstructSteps(input: CsharpNativeConstructInput, node: Node): readonly CsharpNativeOperandStep[] {
  const { ast } = input;
  if (input.evidence.compileTimeMetadata.get(node) || input.operations.nativeUnreachable.get(node) || input.participation.get(node) === "erased") {
    return Object.freeze([]);
  }
  const construct = (child: Node): CsharpNativeOperandStep => Object.freeze({ kind: "construct", node: child });
  const use = (expression: Node | undefined, slot: Parameters<typeof csharpNativeChildUses>[2], owner = node): readonly CsharpNativeOperandStep[] =>
    csharpNativeChildUses(owner, expression, slot).map(child => Object.freeze({ kind: "use", use: child }));
  const attributes = input.attributeApplications.attributeApplication.get(node).flatMap((application, index) =>
    use(application.invocation, { kind: "attribute-invocation", index }));
  const childConstructs = (parent: Node, skipped?: Node): readonly CsharpNativeOperandStep[] => ast.children(parent).flatMap(child =>
    child === undefined || child === skipped || isCsharpNativeExpression(ast, child) || IsTypeSyntaxNode(ast, child) || ast.is.IsTypeLiteralNode(child) ||
      ast.kindName(child).endsWith("Keyword") || ast.kindName(child).endsWith("Token") || ast.kindName(child) === "KindEndOfFile" ||
      ast.is.IsClassDeclaration(child) && input.classFactories.classFactory.get(child) !== undefined ? [] : [construct(child)]);
  const parameters = (): readonly CsharpNativeOperandStep[] => ast.parameters(node).flatMap(parameter => parameter === undefined ? [] : [construct(parameter)]);
  const finish = (steps: readonly CsharpNativeOperandStep[]): readonly CsharpNativeOperandStep[] => Object.freeze([...steps]);
  if (ast.is.IsSourceFile(node)) return finish([...input.classFactories.factories.filter(factory => factory.sourceFile === node)
    .map(factory => construct(factory.declaration)), ...childConstructs(node)]);
  if (input.participation.get(node) === "signature") return finish([...attributes, ...parameters()]);
  if (ast.is.IsClassDeclaration(node) || ast.is.IsClassExpression(node)) {
    const region = (isStatic: boolean): readonly CsharpNativeOperandStep[] => input.classInitialization.classInitializationRegion.get(node, isStatic)
      .flatMap(member => {
        if (ast.is.IsClassStaticBlockDeclaration(member)) return [construct(member)];
        const property = ast.as.AsPropertyDeclaration(member);
        const initializer = property?.Initializer;
        return sourceClassFieldIsTypeOnly(ast, member) || initializer === undefined ||
          input.evidence.sourceField.get([member, property?.name, property?.Type, initializer]) !== undefined
          ? [] : use(initializer, { kind: "initializer" }, member);
      });
    const members = ast.members(node).filter((member): member is Node => member !== undefined &&
      !ast.is.IsClassStaticBlockDeclaration(member) && !sourceClassFieldIsTypeOnly(ast, member));
    const split = input.classFactories.classFactory.get(node) !== undefined || input.projectTypes.definitionContainingDeclaration(node)?.staticCompanion === true;
    return finish(split ? [...attributes, ...region(false), ...members.filter(member => !ast.hasModifierKind(member, "static")).map(construct),
      ...region(true), ...members.filter(member => ast.hasModifierKind(member, "static")).map(construct)]
      : [...attributes, ...region(false), ...region(true), ...members.map(construct)]);
  }
  if (ast.is.IsPropertyDeclaration(node)) return finish([...attributes, ...childConstructs(node)]);
  if (ast.is.IsConstructorDeclaration(node)) {
    const call = input.baseCalls.get(node);
    const body = ast.body(node);
    return finish([...attributes, ...parameters(), ...(call === undefined ? [] : ast.arguments(call).flatMap((argument, index) =>
      use(argument, { kind: "base-argument", sourceIndex: index }))), ...(body === undefined ? [] : [construct(body)])]);
  }
  if (ast.is.IsForStatement(node)) {
    const statement = ast.as.AsForStatement(node);
    const initializer = statement?.Initializer;
    return finish([...attributes, ...(initializer === undefined ? [] : isCsharpNativeExpression(ast, initializer)
      ? use(initializer, { kind: "initializer" }) : [construct(initializer)]), ...use(statement?.Condition, { kind: "condition" }),
      ...use(statement?.Incrementor, { kind: "effect" }), ...(statement?.Statement === undefined ? [] : [construct(statement.Statement)])]);
  }
  if (ast.is.IsSwitchStatement(node)) {
    const statement = ast.as.AsSwitchStatement(node);
    const clauses = statement?.CaseBlock === undefined ? [] : ast.children(statement.CaseBlock);
    return finish([...attributes, ...use(statement?.Expression, { kind: "condition" }), ...clauses.flatMap((clause, index) =>
      clause === undefined ? [] : [...(ast.is.IsCaseClause(clause) ? use(ast.as.AsCaseOrDefaultClause(clause)?.Expression, { kind: "case", index }) : []), construct(clause)])]);
  }
  const uses: CsharpNativeOperandStep[] = [];
  if (ast.is.IsExpressionStatement(node)) uses.push(...use(ast.as.AsExpressionStatement(node)?.Expression, { kind: "effect" }));
  else if (ast.is.IsReturnStatement(node)) uses.push(...use(ast.as.AsReturnStatement(node)?.Expression, { kind: "return" }));
  else if (ast.is.IsThrowStatement(node)) {
    if (!input.operations.exactCatchRethrow.get(node)) uses.push(...use(ast.as.AsThrowStatement(node)?.Expression, { kind: "thrown" }));
  } else if (ast.is.IsVariableDeclaration(node)) {
    if (input.evidence.sourceStruct.get(node) === undefined) uses.push(...use(ast.as.AsVariableDeclaration(node)?.Initializer, { kind: "initializer" }));
  } else if (ast.is.IsBindingElement(node) || ast.is.IsParameterDeclaration(node)) {
    const initializer = ast.is.IsBindingElement(node) ? ast.as.AsBindingElement(node)?.Initializer : ast.as.AsParameterDeclaration(node)?.Initializer;
    if (initializer !== undefined && !input.unusedDefault.get(initializer)) uses.push(...csharpNativeChildUses(node, initializer, { kind: "default" })
      .map(child => Object.freeze({ kind: "use" as const, use: Object.freeze({ ...child, guard: "if-absent" as const }) })));
  } else if (ast.is.IsEnumMember(node)) uses.push(...use(ast.as.AsEnumMember(node)?.Initializer, { kind: "initializer" }));
  else if (ast.is.IsIfStatement(node)) uses.push(...use(ast.as.AsIfStatement(node)?.Expression, { kind: "condition" }));
  else if (ast.is.IsWhileStatement(node)) uses.push(...use(ast.as.AsWhileStatement(node)?.Expression, { kind: "condition" }));
  else if (ast.is.IsDoStatement(node)) uses.push(...use(ast.as.AsDoStatement(node)?.Expression, { kind: "condition" }));
  else if (ast.is.IsForOfStatement(node) || ast.is.IsForInStatement(node)) uses.push(...use(ast.as.AsForInOrOfStatement(node)?.Expression, { kind: "operand", position: "only" }));
  else if (ast.is.IsExportAssignment(node)) {
    const assignment = ast.as.AsExportAssignment(node);
    if (assignment?.IsExportEquals === false) uses.push(...use(assignment.Expression, { kind: "initializer" }));
  } else if (ast.is.IsArrowFunction(node)) {
    const body = ast.body(node);
    if (body !== undefined && !ast.is.IsBlock(body)) uses.push(...use(body, { kind: "return" }));
  }
  const parent = ast.parent(node);
  const skippedCall = parent !== undefined && ast.is.IsConstructorDeclaration(parent) && ast.body(parent) === node ? input.baseCalls.get(parent) : undefined;
  const skipped = skippedCall === undefined ? undefined : ast.parent(skippedCall);
  return finish([...attributes, ...uses, ...childConstructs(node, skipped)]);
}
