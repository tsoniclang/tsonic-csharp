import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact,
  CsharpTargetNamedTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../target-model/types/object-shape-members.js";
import { formCsharpObjectShapeInstantiationHeader, completeCsharpObjectShapeInstantiation,
  type CsharpObjectShapeInstantiationHeader } from "../../../policy/types/objects/instantiation.js";
import { substituteObjectShapeMemberTargetTypeParameters } from "../../../policy/types/resolution/substitution.js";
import { csharpSourceTemplateState } from "../../source-evidence/types/resolution/type-bindings.js";
import { nextState } from "../../source-evidence/types/resolution/state.js";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import type { CsharpObjectShapePolicyHost, CsharpRecursiveObjectShapePolicy } from "./model.js";
import type { CsharpDeclaredObjectShapeSource, CsharpObjectShapeSourceMember } from "./shape-source.js";
import type { CsharpProjectDeclarationShapeSource } from "./project-declaration-source.js";
import type { createCsharpObjectShapeSourceFormation } from "./type-source.js";
import { completeCsharpObjectShapeOwnerHeader, formCsharpObjectShapeHeader, requireCsharpObjectShapeHeader,
  type CsharpObjectShapeHeader } from "../../../target-model/types/object-shape-header.js";
import { csharpStructuralHeaderMembers, type CsharpStructuralMembersHeader } from "./member-evidence.js";
import type { CsharpObjectShapePublisher } from "./publication.js";

export type CsharpProjectDeclarationApplication = {
  readonly targetType: CsharpTargetNamedTypeRef;
  readonly source: CsharpDeclaredObjectShapeSource;
} & (
  | { readonly kind: "instance"; readonly template: CsharpProjectDeclarationApplication }
  | { readonly kind: "declaration"; readonly declaration: CsharpProjectDeclarationShapeSource;
      readonly members: CsharpStructuralMembersHeader;
      readonly inherited: readonly ({ readonly application: CsharpProjectDeclarationApplication;
        readonly member: CsharpObjectShapeSourceMember } | undefined)[] }
);

type CsharpProjectDeclarationNativeHeader = {
  readonly shape: CsharpObjectShapeFact;
  readonly header: CsharpObjectShapeHeader;
} & (
  | { readonly kind: "instance";
      readonly application: Extract<CsharpProjectDeclarationApplication, { readonly kind: "instance" }>;
      readonly template: CsharpProjectDeclarationNativeHeader;
      readonly instantiation: CsharpObjectShapeInstantiationHeader }
  | { readonly kind: "declaration";
      readonly application: Extract<CsharpProjectDeclarationApplication, { readonly kind: "declaration" }>;
      readonly inherited: readonly ({ readonly header: CsharpProjectDeclarationNativeHeader;
        readonly memberIndex: number } | undefined)[] }
);

export function createCsharpProjectDeclarationApplications(
  host: CsharpObjectShapePolicyHost,
  formation: ReturnType<typeof createCsharpObjectShapeSourceFormation>,
  memberResolver: Pick<CsharpRecursiveObjectShapePolicy, "formSourceMembersHeader" | "completeSourceMembers">,
  owner: {
    readonly rememberTargetShape: CsharpObjectShapePublisher;
  },
) {
  const { rememberTargetShape } = owner;
  function nativeOwner(type: CsharpTargetNamedTypeRef): CsharpTargetNamedTypeRef | undefined {
    const definition = host.projectTypeCatalog.definitionForTarget(type);
    return completeCsharpObjectShapeOwnerHeader(type, definition?.kind === "class" || definition?.kind === "interface",
      host.typeParameterConstraints);
  }

  function formDeclarationApplication(
    target: CsharpTargetNamedTypeRef,
    source: CsharpDeclaredObjectShapeSource,
    state: CsharpTypeResolutionState,
  ): CsharpProjectDeclarationApplication | undefined {
    const definition = host.projectTypeCatalog.definitionForTarget(target);
    if (definition?.kind !== "class" && definition?.kind !== "interface" ||
      (target.typeArguments?.length ?? 0) !== definition.typeParameterBindings.length) return undefined;
    const checked = host.projectDeclarations.declarationForId(definition.id);
    if (checked?.declaration !== definition.declaration || source.declaration.definition !== checked) return failTargetAnalysisInvariant("tsonic-csharp",
      "A native declaration header requires its exact checked declaration occurrence.", definition.declaration);
    const targetType = nativeOwner(target);
    if (targetType === undefined) return undefined;
    const declarationType = host.projectTypeCatalog.targetTypeForDeclaration(definition.declaration, definition.typeParameterBindings);
    if (declarationType === undefined) return undefined;
    if (!targetTypeRefEquals(declarationType, targetType)) {
      const template = formDeclarationApplication(declarationType, source,
        nextState(csharpSourceTemplateState([...definition.outerTypeParameters, ...definition.typeParameters], state)));
      return template === undefined ? undefined : Object.freeze({ kind: "instance", targetType, template, source: template.source });
    }
    const declaration = formation.bindProjectDeclarationSource(source.declaration, state);
    const headers = memberResolver.formSourceMembersHeader(declaration.application, targetType);
    if (headers === undefined) return undefined;
    const inherited: (Extract<CsharpProjectDeclarationApplication, { readonly kind: "declaration" }>["inherited"][number])[] = [];
    for (const [index, selectedSource] of declaration.members.entries()) {
      const member = selectedSource.member;
      const owner = selectedSource.inherited?.source.definition;
      if (owner === undefined) {
        inherited.push(undefined);
        continue;
      }
      const native = host.projectTypeCatalog.definitionForDeclaration(owner.declaration);
      const ownerType = native === undefined ? undefined
        : host.projectTypeCatalog.targetTypeForDeclaration(native.declaration, native.typeParameterBindings);
      const selectedOwner = ownerType === undefined ? undefined
        : host.projectTypeQueries.instantiateDeclarationType(owner.declaration, targetType, ownerType);
      if (selectedOwner?.kind !== "resolved" || selectedOwner.type.kind !== "target-named") return undefined;
      const inheritedSource = source.inherited[index];
      if (inheritedSource?.declaration !== selectedSource.inherited!.source) return failTargetAnalysisInvariant("tsonic-csharp",
        "Inherited native binding requires its original retained declaration source.", member.methodDeclaration);
      const application = formDeclarationApplication(selectedOwner.type, inheritedSource, nextState(declaration.state));
      if (application === undefined) return undefined;
      const row = application.source.members[selectedSource.inherited!.index];
      if (application.source !== inheritedSource || row === undefined ||
        row.proof !== selectedSource.inherited!.member) return failTargetAnalysisInvariant("tsonic-csharp",
        "Inherited source proof selection requires its exact published member row.", member.methodDeclaration);
      inherited.push(Object.freeze({ application, member: row }));
    }
    return Object.freeze({ kind: "declaration", targetType, declaration, source, members: headers,
      inherited: Object.freeze(inherited) });
  }

  function completeDeclarationApplication(
    application: CsharpProjectDeclarationApplication,
  ): CsharpObjectShapeFact | undefined {
    const native = formDeclarationHeader(application);
    return native === undefined ? undefined : completeDeclarationSource(native);
  }

  function formDeclarationHeader(
    application: CsharpProjectDeclarationApplication,
  ): CsharpProjectDeclarationNativeHeader | undefined {
    if (application.kind === "instance") {
      const template = formDeclarationHeader(application.template);
      const instantiation = template === undefined ? undefined
        : formCsharpObjectShapeInstantiationHeader(template.header, application.targetType);
      if (template === undefined || instantiation === undefined) return undefined;
      const shape = completeCsharpObjectShapeInstantiation(instantiation, template.shape);
      return Object.freeze({ kind: "instance", application, template, instantiation, shape,
        header: formCsharpObjectShapeHeader(shape) });
    }
    const { declaration, targetType } = application;
    const definition = host.projectTypeCatalog.definitionForDeclaration(declaration.definition.declaration);
    if (definition === undefined || definition.id !== declaration.definition.id) return failTargetAnalysisInvariant("tsonic-csharp",
      "Declaration completion requires its same published native header.", declaration.definition.declaration);
    if (application.members.source !== declaration.application || application.members.application.receiver !== targetType) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "Declaration completion requires its exact current member headers and receiver.", declaration.definition.declaration);
    }
    const declared = csharpStructuralHeaderMembers(application.members);
    const substitutions = new Map(definition.typeParameterBindings.map((parameter, index) =>
      [parameter.identity, targetType.typeArguments![index]!]));
    const implemented = definition.kind === "interface" ? host.projectTypeQueries.directSupertypes(targetType) : [];
    if (implemented === undefined) return undefined;
    const members: CsharpObjectShapeMemberFact[] = [];
    const inheritedHeaders: Extract<CsharpProjectDeclarationNativeHeader, { readonly kind: "declaration" }>["inherited"][number][] = [];
    for (const [index, original] of declared.entries()) {
      let member = substituteObjectShapeMemberTargetTypeParameters(original, substitutions);
      const inherited = application.inherited[index];
      if (inherited !== undefined) {
        const completed = formDeclarationHeader(inherited.application);
        if (completed === undefined) return undefined;
        const selected = resolveCsharpObjectShapeMemberBySelectedSubject(completed.shape,
          [...member.sourceSubjects ?? [], ...member.sourceDeclarations ?? []]);
        if (selected.kind !== "resolved" || selected.member.memberKind !== "method") return undefined;
        inheritedHeaders.push(Object.freeze({ header: completed, memberIndex: completed.shape.members.indexOf(selected.member) }));
        const proof = application.source.members[index]!.proof;
        member = Object.freeze({ ...selected.member, sourceSubjects: proof.sourceSubjects,
          ...(member.sourceTypes === undefined ? {} : { sourceTypes: proof.sourceTypes }),
        });
      } else inheritedHeaders.push(undefined);
      members.push(member);
    }
    const shape: CsharpObjectShapeFact = Object.freeze({ targetType,
      sourceType: declaration.declaredType, members: Object.freeze(members),
      ...(definition.kind !== "class" ? {} : { constructible: declaration.initializable }),
      ...(implemented.length === 0 ? {} : { implements: implemented }),
    });
    return Object.freeze({ kind: "declaration", application, shape, header: formCsharpObjectShapeHeader(shape),
      inherited: Object.freeze(inheritedHeaders) });
  }

  function completeDeclarationSource(native: CsharpProjectDeclarationNativeHeader): CsharpObjectShapeFact | undefined {
    if (native.kind === "instance") {
      const template = completeDeclarationSource(native.template);
      if (template === undefined) return undefined;
      const completed = completeCsharpObjectShapeInstantiation(native.instantiation, template);
      requireCsharpObjectShapeHeader(native.header, completed);
      return rememberTargetShape(native.header, completed);
    }
    const { application } = native;
    const declared = memberResolver.completeSourceMembers(application.members);
    if (declared === undefined) return undefined;
    if (declared.length !== native.shape.members.length || native.inherited.length !== declared.length) {
      return failTargetAnalysisInvariant("tsonic-csharp", "Declaration proof requires every member of its identical native header.",
        application.declaration.definition.declaration);
    }
    const members: CsharpObjectShapeMemberFact[] = [];
    for (const [index, source] of declared.entries()) {
      const physical = native.shape.members[index]!;
      const inherited = native.inherited[index];
      if (inherited === undefined) {
        members.push(Object.freeze({ ...physical, sourceSubjects: source.sourceSubjects,
          sourceDeclarations: source.sourceDeclarations, sourceTypes: source.sourceTypes,
          sourceMemberEvidence: source.sourceMemberEvidence }));
        continue;
      }
      const completed = completeDeclarationSource(inherited.header);
      if (completed === undefined) return undefined;
      requireCsharpObjectShapeHeader(inherited.header.header, completed);
      const selected = completed.members[inherited.memberIndex];
      const input = application.inherited[index]?.member.proof;
      if (selected === undefined || input === undefined || selected.sourceSubjects !== input.sourceSubjects ||
        selected.sourceDeclarations !== input.sourceDeclarations || selected.sourceTypes !== input.sourceTypes ||
        selected.sourceMemberEvidence !== input.sourceMemberEvidence || selected.optional !== input.optional) {
        return failTargetAnalysisInvariant("tsonic-csharp",
          "Inherited native completion requires the exact selected pre-child source proof row.", application.declaration.definition.declaration);
      }
      const proof = application.source.members[index]!.proof;
      members.push(Object.freeze({ ...physical, sourceSubjects: proof.sourceSubjects,
        sourceDeclarations: selected.sourceDeclarations, sourceMemberEvidence: proof.sourceMemberEvidence,
        sourceTypes: source.sourceTypes === undefined ? selected.sourceTypes : proof.sourceTypes }));
    }
    const completed = Object.freeze({ ...native.shape, members: Object.freeze(members) });
    requireCsharpObjectShapeHeader(native.header, completed);
    return rememberTargetShape(native.header, completed);
  }

  return Object.freeze({ nativeOwner, formDeclarationApplication, completeDeclarationApplication });
}
