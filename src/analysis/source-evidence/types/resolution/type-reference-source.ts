import type { ExtensionFactSubject, Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { classifyCsharpSourceProfileDeclaration, classifyCsharpSourceProfileType,
  type CsharpSourceProfileTypeIdentity } from "../../../../policy/identities/source-types.js";
import { csharpSourceTypeArgumentNodes } from "../../../../target-model/syntax/type-arguments.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { formCsharpProjectReferenceSource, type CsharpProjectReferenceSource } from "./project-types.js";
import { sourceFactSubjectsForNode } from "./source-evidence.js";
import { formCsharpSourceTypeBindingEvidence, type CsharpSourceTypeBindingEvidence } from "./type-bindings.js";
import { csharpSourceStorageComponentContext } from "./source-storage-projection.js";
import { nextState } from "./state.js";
import { formCsharpDirectSourceEvidence, type CsharpDirectSourceEvidence } from "./direct-source-evidence.js";
import { formCsharpStandardTypeTransformationSource,
  type CsharpStandardTypeTransformationSource } from "./standard-transformation-source.js";
import { formCsharpCheckerTransformationSource, type CsharpCheckerTransformationSource } from "./checker-transformation-source.js";

type Transformation = NonNullable<ReturnType<SourceFileSemantics["types"]["standardTransformation"]>>;

interface CsharpTypeReferenceSourceBase {
  readonly node: Node;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
}

interface CsharpTypeReferenceObservations extends CsharpTypeReferenceSourceBase {
  readonly typeName: Node;
  readonly semanticType: Type | undefined;
  readonly binding: CsharpSourceTypeBindingEvidence | undefined;
  readonly subjects: readonly ExtensionFactSubject[];
  readonly direct: CsharpDirectSourceEvidence;
  readonly transformation: Transformation | undefined;
  readonly transformationSource: CsharpStandardTypeTransformationSource | undefined;
  readonly checker: CsharpCheckerTransformationSource | undefined;
}

export type CsharpTypeReferenceSource =
  | CsharpTypeReferenceSourceBase & { readonly kind: "missing-name" }
  | CsharpTypeReferenceObservations & {
      readonly kind: "transformation";
      readonly semanticType: Type;
      readonly transformation: Transformation;
      readonly transformationSource: CsharpStandardTypeTransformationSource;
    }
  | CsharpTypeReferenceObservations & {
      readonly kind: "reference";
      readonly arguments: readonly {
        readonly node: Node;
        readonly state: CsharpTypeResolutionState;
        readonly sourceType: Type | undefined;
        readonly binding: CsharpSourceTypeBindingEvidence | undefined;
      }[];
      readonly project: CsharpProjectReferenceSource | undefined;
      readonly profileIdentity: CsharpSourceProfileTypeIdentity | undefined;
    };

export function formCsharpTypeReferenceSource(
  scope: Pick<CsharpTypeResolutionScope, "host">,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpTypeReferenceSource {
  const { host } = scope;
  const typeName = host.ast.as.AsTypeReferenceNode(node)!.TypeName;
  if (typeName === undefined) return Object.freeze({ kind: "missing-name", node, queries, state });
  const semanticType = queries.types.authoredType(node);
  const binding = semanticType === undefined || state.sourceBindings === undefined ? undefined
    : formCsharpSourceTypeBindingEvidence(semanticType, queries);
  const subjects = Object.freeze([
    ...sourceFactSubjectsForNode(typeName, host.navigation, node),
    ...(semanticType === undefined ? [] : queries.facts.typeSubjects(semanticType)),
  ]);
  const transformation = semanticType === undefined ? undefined : queries.types.standardTransformation(node, semanticType);
  const transformationSource = transformation === undefined || semanticType === undefined ? undefined
    : formCsharpStandardTypeTransformationSource(scope, transformation, queries, state, node, semanticType);
  const checker = transformation !== undefined || semanticType === undefined ? undefined
    : formCsharpCheckerTransformationSource(scope, node, semanticType, queries, state, undefined);
  const observations = { node, queries, state, typeName, semanticType, binding, subjects, transformation, transformationSource, checker,
    direct: formCsharpDirectSourceEvidence(scope, subjects, queries.sourceFile, state) };
  if (transformation !== undefined && semanticType !== undefined && transformationSource !== undefined &&
      (transformation.kind !== "structural" || queries.types.indexInfos(semanticType).length === 0)) {
    return Object.freeze({ ...observations, kind: "transformation", semanticType, transformation, transformationSource });
  }
  const argumentNodes = csharpSourceTypeArgumentNodes(host.ast, node);
  const arguments_ = Object.freeze(argumentNodes.map(argument => {
    const sourceType = queries.types.authoredType(argument);
    const argumentState = nextState(semanticType !== undefined && queries.types.isArrayLike(semanticType) &&
      !queries.types.isTuple(semanticType)
      ? csharpSourceStorageComponentContext(host, state, { kind: "array-element" }) : state);
    return Object.freeze({ node: argument, state: Object.freeze(argumentState), sourceType,
      binding: sourceType === undefined || state.sourceBindings === undefined ? undefined
        : formCsharpSourceTypeBindingEvidence(sourceType, queries) });
  }));
  const selectedDeclaration = host.navigation.sourceReferenceFor(typeName)?.declaration;
  const profileIdentity = selectedDeclaration === undefined
    ? semanticType === undefined ? undefined : classifyCsharpSourceProfileType(semanticType, queries, host.ast)
    : classifyCsharpSourceProfileDeclaration(selectedDeclaration, host.ast);
  return Object.freeze({ ...observations, kind: "reference", arguments: arguments_, profileIdentity,
    project: formCsharpProjectReferenceSource(scope, typeName, queries.sourceFile, state) });
}
