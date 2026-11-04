import type { Node, SourceFile } from "@tsonic/tsts";
import { sourceEnclosingCallable } from "@tsonic/target-api/source";
import type { ResolvedSourceCallInfo } from "../../../target-model/records/calls/source-calls.js";
import type { CsharpTypePolicyBaseHost, CsharpTypePolicy } from "../../source-evidence/types/resolution/model.js";
import type { CsharpSourceCalleeSelection } from "../../../target-model/operations/source-callees.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import { getCsharpCallableValueSignature, getCsharpDelegateSignature } from "../../../target-model/types/carriers/delegates.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import type { CsharpProjectTypeCatalog } from "../../../target-model/records/types/project-types.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { completeCsharpStaticMemberReceiver, formCsharpStaticMemberReceiverSource,
  type CsharpStaticMemberReceiverSource } from "../../../policy/types/project/static-members.js";
import { getCsharpRuntimeUnionArms } from "../../../target-model/types/carriers/runtime-carriers.js";
import type { CsharpTypeDefinitions } from "../../../target-model/types/source-union-definitions.js";

export interface CsharpSourceCalleeHost {
  readonly moduleCallables: CsharpTypePolicyBaseHost["moduleCallables"];
  readonly ast: CsharpTypePolicyBaseHost["ast"];
  readonly navigation: CsharpTypePolicyBaseHost["navigation"];
  readonly projectTypeCatalog: Pick<CsharpProjectTypeCatalog, "definitionForTarget" | "definitionForDeclaration">;
  readonly types: Pick<CsharpTypePolicy, "resolveSelectedValue" | "resolveReadStorage">;
  readonly typeDefinitions?: CsharpTypeDefinitions;
}

type CsharpSourceCalleeObservations = {
  readonly source: ResolvedSourceCallInfo;
  readonly sourceFile: SourceFile;
  readonly expression: Node;
  readonly selected: Node | undefined;
  readonly reference: ReturnType<CsharpSourceCalleeHost["navigation"]["sourceReferenceFor"]>;
  readonly declaration: Node | undefined;
  readonly moduleCallable: Node | undefined;
};

export type CsharpSourceCalleeSource = CsharpSourceCalleeObservations & (
  | { readonly kind: "direct"; readonly project: boolean; readonly targetDeclaration: Node }
  | { readonly kind: "self"; readonly targetDeclaration: Node;
      readonly directName: NonNullable<ReturnType<CsharpSourceCalleeHost["ast"]["name"]>> }
  | { readonly kind: "indirect";
      readonly access: ResolvedSourceCallInfo["sourceCalleeAccess"];
      readonly staticReceiver: CsharpStaticMemberReceiverSource | undefined;
      readonly staticMethods: boolean;
      readonly nominalMethod: boolean;
      readonly liftedReceiver: boolean;
      readonly methodDeclaration: boolean;
      readonly selectedMethod: boolean }
);

export function formCsharpSourceCalleeSource(
  policy: Pick<CsharpSourceCalleeHost, "ast" | "navigation" | "moduleCallables">,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): CsharpSourceCalleeSource {
  const expression = source.sourceCallee.expression;
  const selected = source.sourceCalleeAccess?.selectedDeclaration ?? source.sourceCallee.selectedDeclaration;
  const reference = policy.navigation.sourceReferenceFor(expression);
  const declaration = reference?.declaration ?? source.sourceCalleeAccess?.declaration ?? source.sourceCallee.declaration;
  const moduleCallable = declaration === undefined ? undefined : policy.moduleCallables.get(declaration)?.callable;
  const observations = { source, sourceFile, expression, selected, reference, declaration, moduleCallable };
  if (declaration !== undefined && selected !== undefined &&
    (policy.ast.is.IsFunctionDeclaration(declaration) && policy.ast.is.IsFunctionDeclaration(selected) ||
      moduleCallable !== undefined && (selected === declaration || selected === moduleCallable))) {
    return Object.freeze({ ...observations, kind: "direct", project: policy.navigation.isProjectDeclaration(selected),
      targetDeclaration: moduleCallable ?? selected });
  }
  const directName = declaration !== undefined && declaration === selected &&
    policy.ast.kindName(declaration) === "KindFunctionExpression" ? policy.ast.name(declaration) : undefined;
  if (directName !== undefined && declaration !== undefined && sourceEnclosingCallable(expression, policy.ast) === declaration &&
      policy.navigation.isProjectDeclaration(declaration)) {
    return Object.freeze({ ...observations, kind: "self", directName, targetDeclaration: declaration });
  }
  const access = source.sourceCalleeAccess;
  const staticReceiver = access === undefined ? undefined
    : formCsharpStaticMemberReceiverSource(policy.ast, policy.navigation, selected, access.receiver.expression);
  const nominalMethod = declaration !== undefined && selected !== undefined &&
    policy.ast.is.IsClassDeclaration(policy.ast.parent(declaration));
  const liftedReceiver = source.optionalChain && source.sourceReceiver !== undefined &&
    policy.ast.is.IsCallExpression(source.call) && policy.ast.as.AsCallExpression(source.call)?.QuestionDotToken === undefined &&
    nominalMethod && policy.ast.questionToken(declaration) === undefined && policy.ast.questionToken(selected) === undefined;
  const declarationMethod = declaration !== undefined && selected !== undefined && policy.ast.is.IsMethodDeclaration(declaration);
  const selectedMethod = declaration !== undefined && selected !== undefined && policy.ast.is.IsMethodDeclaration(selected);
  return Object.freeze({ ...observations, kind: "indirect", access, staticReceiver,
    staticMethods: declarationMethod && selectedMethod,
    nominalMethod, liftedReceiver,
    methodDeclaration: declaration !== undefined && selected !== undefined &&
      (declarationMethod || policy.ast.kindName(declaration) === "KindMethodSignature"),
    selectedMethod: declaration !== undefined && selected !== undefined &&
      (selectedMethod || policy.ast.kindName(selected) === "KindMethodSignature"),
  });
}

export function classifyCsharpSourceCallee(
  policy: CsharpSourceCalleeHost,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): CsharpSourceCalleeSelection {
  return classifyFormedCsharpSourceCallee(policy, formCsharpSourceCalleeSource(policy, source, sourceFile));
}

export function classifyFormedCsharpSourceCallee(
  policy: Pick<CsharpSourceCalleeHost, "projectTypeCatalog" | "types" | "typeDefinitions">,
  input: CsharpSourceCalleeSource,
): CsharpSourceCalleeSelection {
  if (policy.projectTypeCatalog === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
    "A source callee requires its actual current declaration and ABI catalog.", input.source.call);
  const { expression, sourceFile, selected, declaration } = input;
  if (input.kind === "direct") {
    if (!input.project) return Object.freeze({ kind: "rejected",
      reason: "The exact selected source callee is external to the project and has no C# target relation." });
    return Object.freeze({ kind: "function", expression, declaration: input.targetDeclaration });
  }
  if (input.kind === "self") return Object.freeze({ kind: "function", expression, declaration: input.targetDeclaration });
  const access = input.access;
  if (access !== undefined && selected === undefined && declaration === undefined) {
    const receiver = policy.types.resolveSelectedValue(access.receiver.expression, access.receiver.type, sourceFile);
    const arms = getCsharpRuntimeUnionArms(receiver, policy.typeDefinitions);
    if (receiver !== undefined && arms !== undefined && arms.length > 1 &&
      arms.every(arm => policy.projectTypeCatalog.definitionForTarget(arm)?.kind === "class")) {
      return Object.freeze({ kind: "union-method", expression: access.expression,
        receiver: Object.freeze({ expression: access.receiver.expression, type: receiver }) });
    }
  }
  const staticReceiver = input.staticReceiver === undefined ? undefined : completeCsharpStaticMemberReceiver(
    input.staticReceiver, policy.projectTypeCatalog.definitionForDeclaration(input.staticReceiver.ownerDeclaration));
  if (staticReceiver !== undefined && declaration !== undefined && selected !== undefined &&
    input.staticMethods && access !== undefined) {
    return Object.freeze({ kind: "method", expression: access.expression, declaration: selected,
      receiver: Object.freeze({ expression: access.receiver.expression, type: staticReceiver }) });
  }
  const type = access === undefined
    ? policy.types.resolveSelectedValue(expression, input.source.sourceCallee.type, sourceFile)
    : policy.types.resolveReadStorage(expression, sourceFile);
  const reject = (reason: string): CsharpSourceCalleeSelection => Object.freeze({ kind: "rejected", reason });
  if (selected === undefined || declaration === undefined) {
    if (type === undefined || getCsharpCallableValueSignature(getCsharpNullableElementTargetType(type) ?? type) === undefined) {
      return reject("A source callee requires its exact selected declaration or native callable storage contract.");
    }
  } else {
    if ((getCsharpNullableElementTargetType(type) === undefined || input.liftedReceiver) &&
      (getCsharpMethodValue(type) === undefined || input.nominalMethod) &&
      (access?.kind === "property" || access?.kind === "element") &&
      input.methodDeclaration && input.selectedMethod) {
      const receiver = policy.types.resolveSelectedValue(access.receiver.expression, access.receiver.type, sourceFile);
      if (receiver === undefined) return reject("A direct source method requires its exact native receiver contract.");
      return Object.freeze({ kind: "method", expression: access.expression, declaration: selected,
        receiver: Object.freeze({ expression: access.receiver.expression, type: receiver }) });
    }
  }
  if (type === undefined || getCsharpMethodValue(getCsharpNullableElementTargetType(type) ?? type) === undefined &&
      getCsharpDelegateSignature(getCsharpNullableElementTargetType(type) ?? type) === undefined) {
    return reject("A source callable value requires its exact native delegate or method-value storage contract.");
  }
  return Object.freeze({ kind: "value", expression, type });
}
