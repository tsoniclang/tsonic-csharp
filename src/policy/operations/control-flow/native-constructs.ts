import type { Node, SourceFile } from "@tsonic/tsts";
import { IsTypeSyntaxNode, sourceClassFieldIsTypeOnly, sourceConstructValueInputs, type SourceValueInput } from "@tsonic/target-api/source";
import type { CsharpAttributeApplicationIndex } from "../../../target-model/records/attributes.js";
import type { CsharpClassInitializationIndex } from "../../../target-model/records/class-initialization.js";
import type { CsharpNativeParticipationInput } from "../../../target-model/records/native-demand.js";
import type { CsharpProjectTypeClassifications } from "../../../target-model/records/project-types.js";
import type { CsharpCallableTargetClassifications } from "../../../target-model/records/source-callable-contract.js";
import { csharpNativeChildUses, isCsharpNativeExpression, type CsharpNativeOperandInput, type CsharpNativeOperandStep } from "./native-operands.js";

export interface CsharpNativeConstructInput extends CsharpNativeOperandInput, CsharpNativeParticipationInput {
  readonly sourceFiles: readonly SourceFile[];
  readonly attributeApplications: CsharpAttributeApplicationIndex;
  readonly classInitialization: Pick<CsharpClassInitializationIndex, "classInitializationRegion">;
  readonly projectTypes: Pick<CsharpProjectTypeClassifications, "definitionContainingDeclaration">;
  readonly baseCalls: { readonly get: (constructor: Node) => Node | undefined };
  readonly unusedDefault: { readonly get: (initializer: Node) => boolean };
  readonly callableTarget: Pick<CsharpCallableTargetClassifications, "entry">;
}

export type CsharpNativeConstructSelection =
  | { readonly kind: "erased" }
  | { readonly kind: "pending"; readonly reason: "callable-entry"; readonly steps: readonly CsharpNativeOperandStep[] }
  | { readonly kind: "selected"; readonly steps: readonly CsharpNativeOperandStep[] };

export function selectCsharpNativeConstructSteps(input: CsharpNativeConstructInput, node: Node): CsharpNativeConstructSelection {
  const { ast } = input;
  if (input.evidence.compileTimeMetadata.get(node) || input.operations.nativeUnreachable.get(node) || input.participation.get(node) === "erased") {
    return Object.freeze({ kind: "erased" });
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
  const participation = input.participation.get(node);
  const entry = participation === "body" || participation === "frame-body" || participation === "signature"
    ? input.callableTarget.entry(node) : undefined;
  const pendingEntry = (participation === "body" || participation === "frame-body" || participation === "signature") && entry === undefined;
  const parameters = (): readonly CsharpNativeOperandStep[] => entry === undefined ? []
    : [...new Set(entry.parameters.map(parameter => parameter.sourceParameter))].map(construct);
  const finish = (steps: readonly CsharpNativeOperandStep[]): CsharpNativeConstructSelection =>
    pendingEntry ? Object.freeze({ kind: "pending", reason: "callable-entry", steps: Object.freeze([...steps]) })
      : Object.freeze({ kind: "selected", steps: Object.freeze([...steps]) });
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
    return finish([...attributes, ...parameters(), ...(call === undefined ? [] : use(call, { kind: "effect" })),
      ...(body === undefined ? [] : [construct(body)])]);
  }
  if (participation === "body" || participation === "frame-body") return finish([
    ...attributes, ...parameters(), ...sourceConstructValueInputs(ast, node).flatMap(entry => use(entry.expression, entry.slot, entry.owner)),
    ...childConstructs(node).filter(step => step.kind !== "construct" || !ast.is.IsParameterDeclaration(step.node)),
  ]);
  const sourceInputs = sourceConstructValueInputs(ast, node);
  const sourceUse = (entry: SourceValueInput): readonly CsharpNativeOperandStep[] => {
    if (entry.slot.kind === "thrown" && input.operations.exactCatchRethrow.get(node) ||
      entry.slot.kind === "initializer" && ast.is.IsVariableDeclaration(node) && input.evidence.sourceStruct.get(node) !== undefined) return [];
    if (entry.slot.kind === "default") return input.unusedDefault.get(entry.expression) ? []
      : csharpNativeChildUses(entry.owner, entry.expression, entry.slot)
        .map(child => Object.freeze({ kind: "use" as const, use: Object.freeze({ ...child, guard: "if-absent" as const }) }));
    return use(entry.expression, entry.slot, entry.owner);
  };
  if (ast.is.IsForStatement(node)) {
    const statement = ast.as.AsForStatement(node);
    const initializer = statement?.Initializer;
    return finish([...attributes, ...(initializer === undefined || isCsharpNativeExpression(ast, initializer) ? [] : [construct(initializer)]),
      ...sourceInputs.filter(entry => entry.slot.kind !== "initializer" || isCsharpNativeExpression(ast, entry.expression)).flatMap(sourceUse),
      ...(statement?.Statement === undefined ? [] : [construct(statement.Statement)])]);
  }
  if (ast.is.IsSwitchStatement(node)) {
    const statement = ast.as.AsSwitchStatement(node);
    const clauses = statement?.CaseBlock === undefined ? [] : ast.children(statement.CaseBlock);
    const cases = new Map<number, readonly CsharpNativeOperandStep[]>();
    for (const entry of sourceInputs) if (entry.slot.kind === "case") cases.set(entry.slot.index, sourceUse(entry));
    return finish([...attributes, ...sourceInputs.filter(entry => entry.slot.kind !== "case").flatMap(sourceUse),
      ...clauses.flatMap((clause, index) => {
        if (clause === undefined) return [];
        const steps = cases.get(index);
        return [...(steps === undefined ? [] : steps), construct(clause)];
      })]);
  }
  const parent = ast.parent(node);
  const skippedCall = parent !== undefined && ast.is.IsConstructorDeclaration(parent) && ast.body(parent) === node ? input.baseCalls.get(parent) : undefined;
  const skipped = skippedCall === undefined ? undefined : ast.parent(skippedCall);
  return finish([...attributes, ...sourceInputs.flatMap(sourceUse), ...childConstructs(node, skipped)]);
}
