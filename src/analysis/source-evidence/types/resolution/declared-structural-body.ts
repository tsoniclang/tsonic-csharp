import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpNodeQuerySource } from "./root-sources.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import { resolveFormedCsharpCallableDeclarationSignature, resolveFormedCsharpCallableType } from "./source-profiles.js";
import { resolveCsharpStructuralPropertyType } from "./structural-applications.js";
import { csharpDeclaredMemberComponents } from "./declared-receiver-body.js";
import { csharpNullableTargetType } from "../../../../target-model/types/carriers/nullable.js";
import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeTypeSource } from "../../../objects/shapes/type-source.js";

type CsharpDeclaredStructuralCapture = {
  readonly source: CsharpObjectShapeTypeSource["implementationCaptures"][number];
} & (
  | { readonly kind: "dependency" }
  | { readonly kind: "complete"; readonly type: TargetTypeRef }
);

export type CsharpDeclaredStructuralBody = { readonly source: CsharpNodeQuerySource } & (
  | { readonly kind: "not-structural" }
  | { readonly kind: "structural";
      readonly members: readonly Pick<CsharpObjectShapeMemberFact, "type" | "typeParameters">[];
      readonly captures: readonly CsharpDeclaredStructuralCapture[];
      readonly components: readonly TargetTypeRef[] }
);

export function csharpDeclaredStructuralBodySource(
  source: CsharpNodeQuerySource,
) {
  if (source.root.node !== source.node || source.root.sourceFile !== source.sourceFile) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A structural body keeps its exact query occurrence.", source.node);
  }
  if (source.root.kind !== "node" || source.root.declaredReceiver?.source !== undefined) return undefined;
  const structural = source.root.structural.source;
  const semantic = structural?.selection.contextual === undefined ? structural?.semantic : undefined;
  if (semantic?.projectOwned !== true || semantic.projects.length !== 0 || semantic.provider !== undefined ||
    semantic.members === undefined) return undefined;
  const implementation = semantic.implementation;
  if (implementation === undefined ? semantic.implementationCaptures.length !== 0
    : semantic.implementationCaptures.length !== implementation.captures.length ||
      Array.from(semantic.implementationCaptures).some((capture, index) => capture === undefined ||
        capture.node !== implementation.captures[index]?.declaration ||
        capture.sourceFile !== implementation.captures[index]?.sourceFile ||
        capture.state.depth !== implementation.state.depth + 1 ||
        capture.state.sourceBindings !== implementation.state.sourceBindings ||
        capture.state.sourceStorageSubject !== implementation.state.sourceStorageSubject ||
        capture.state.sourceStorageBindings !== implementation.state.sourceStorageBindings ||
        capture.state.rejectNativeResolution !== implementation.state.rejectNativeResolution ||
        capture.callable !== undefined && (capture.callable.state !== capture.state ||
          capture.sourceFile !== undefined && capture.callable.source.queries.sourceFile !== capture.sourceFile))) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A structural body keeps its original ordered implementation captures and binding frame.", source.node);
  }
  return semantic;
}

export function resolveFormedCsharpDeclaredStructuralBody(
  scope: CsharpTypeResolutionScope,
  source: CsharpNodeQuerySource,
  deferredCaptures: ReadonlySet<Node>,
): CsharpDeclaredStructuralBody {
  const semantic = csharpDeclaredStructuralBodySource(source);
  if (semantic === undefined) return Object.freeze({ kind: "not-structural", source });
  const collection = semantic.members;
  if (collection === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
    "A structural body keeps its exact declared member source.", source.node);
  if (collection.collection.ownerType !== semantic.type || collection.collection.queries !== semantic.queries ||
    collection.members.length !== collection.collection.members.length ||
    Array.from(collection.members).some((member, index) => member === undefined || member.source !== collection.collection.members[index])) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A structural body requires its exact ordered declaration collection.", source.node);
  }
  const members: Pick<CsharpObjectShapeMemberFact, "type" | "typeParameters">[] = [];
  for (const member of collection.members) {
    if (member.type.kind === "method") {
      const signature = member.type.signature === undefined ? undefined
        : resolveFormedCsharpCallableDeclarationSignature(scope, member.type.signature);
      if (signature === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "A structural method's declared signature is unavailable before physical completion.", member.source.methodDeclaration);
      members.push(Object.freeze({ type: member.source.nullish && signature.declaration.typeParameters.length === 0
        ? csharpNullableTargetType(signature.signature) : signature.signature,
      typeParameters: signature.declaration.typeParameters }));
    } else {
      const type = resolveCsharpStructuralPropertyType(scope, member.type);
      if (type === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "A structural property's declared component is unavailable before physical completion.", source.node);
      members.push(Object.freeze({ type: member.source.nullish ? csharpNullableTargetType(type) : type }));
    }
  }
  const captures = Object.freeze(semantic.implementationCaptures.map(capture => deferredCaptures.has(capture.node)
    ? Object.freeze({ kind: "dependency" as const, source: capture }) : completeCapture(scope, capture)));
  const declared = Object.freeze(members);
  return Object.freeze({ kind: "structural", source, members: declared, captures,
    components: captureComponents(scope, declared, captures) });
}

export function completeCsharpDeclaredStructuralCaptures(
  scope: CsharpTypeResolutionScope,
  body: Extract<CsharpDeclaredStructuralBody, { readonly kind: "structural" }>,
): Extract<CsharpDeclaredStructuralBody, { readonly kind: "structural" }> {
  const source = csharpDeclaredStructuralBodySource(body.source);
  if (source === undefined || body.captures.length !== source.implementationCaptures.length ||
    Array.from(body.captures).some((capture, index) => capture === undefined || capture.source !== source.implementationCaptures[index])) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A capture dependency keeps its exact retained source occurrence.", body.source.node);
  }
  if (body.captures.every(capture => capture.kind === "complete")) return body;
  const captures = Object.freeze(body.captures.map(capture => capture.kind === "complete"
    ? capture : completeCapture(scope, capture.source)));
  return Object.freeze({ ...body, captures, components: captureComponents(scope, body.members, captures) });
}

function completeCapture(
  scope: CsharpTypeResolutionScope,
  source: CsharpObjectShapeTypeSource["implementationCaptures"][number],
): Extract<CsharpDeclaredStructuralCapture, { readonly kind: "complete" }> {
  const type = source.callable?.kind === "callable" ? resolveFormedCsharpCallableType(scope, source.callable)
    : scope.resolveNodeWithState(source.node, source.sourceFile, source.state);
  if (type === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
    "A structural body requires its original capture's actual Native ABI and current A.", source.node);
  return Object.freeze({ kind: "complete", source, type });
}

function captureComponents(
  scope: CsharpTypeResolutionScope,
  members: readonly Pick<CsharpObjectShapeMemberFact, "type" | "typeParameters">[],
  captures: readonly CsharpDeclaredStructuralCapture[],
): readonly TargetTypeRef[] {
  return csharpDeclaredMemberComponents([...members, ...captures.flatMap(capture => capture.kind === "complete"
    ? [Object.freeze({ type: capture.type })] : [])], scope.host.typeParameterConstraints);
}
