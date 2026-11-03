import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact,
  CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../target-model/types/object-shape-members.js";
import { instantiateCsharpObjectShape } from "../../../policy/types/objects/instantiation.js";
import { substituteObjectShapeMemberTargetTypeParameters } from "../../../policy/types/resolution/substitution.js";
import { csharpSourceTemplateState } from "../../source-evidence/types/resolution/type-bindings.js";
import { nextState } from "../../source-evidence/types/resolution/state.js";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import type { CsharpObjectShapePolicyHost, CsharpRecursiveObjectShapePolicy } from "./model.js";
import type { CsharpDeclaredObjectShapeSource, CsharpObjectShapeSourceMember } from "./shape-source.js";
import type { CsharpProjectDeclarationShapeSource } from "./project-declaration-source.js";
import type { createCsharpObjectShapeSourceFormation } from "./type-source.js";

export type CsharpProjectDeclarationApplication = {
  readonly targetType: CsharpTargetNamedTypeRef;
  readonly source: CsharpDeclaredObjectShapeSource;
} & (
  | { readonly kind: "instance"; readonly template: CsharpProjectDeclarationApplication }
  | { readonly kind: "declaration"; readonly declaration: CsharpProjectDeclarationShapeSource;
      readonly inherited: readonly ({ readonly application: CsharpProjectDeclarationApplication;
        readonly member: CsharpObjectShapeSourceMember } | undefined)[] }
);

export function createCsharpProjectDeclarationApplications(
  host: CsharpObjectShapePolicyHost,
  formation: ReturnType<typeof createCsharpObjectShapeSourceFormation>,
  completeSourceMembers: CsharpRecursiveObjectShapePolicy["completeSourceMembers"],
  rememberTargetShape: (shape: CsharpObjectShapeFact) => CsharpObjectShapeFact,
) {
  function nativeOwner(type: CsharpTargetNamedTypeRef): CsharpTargetNamedTypeRef | undefined {
    const definition = host.projectTypeCatalog.definitionForTarget(type);
    if (definition?.kind !== "class" && definition?.kind !== "interface" || type.typeArguments === undefined) return type;
    const arguments_ = type.typeArguments.map(argument => {
      if (argument.kind !== "type-parameter") return argument;
      const constraints = host.typeParameterConstraints(argument);
      return constraints.kind === "resolved" ? Object.freeze({ ...argument, csharpConstraints: constraints }) : undefined;
    });
    return arguments_.some(argument => argument === undefined) ? undefined
      : { ...type, typeArguments: Object.freeze(arguments_ as readonly TargetTypeRef[]) };
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
    const inherited: (Extract<CsharpProjectDeclarationApplication, { readonly kind: "declaration" }>["inherited"][number])[] = [];
    for (const [index, selectedSource] of declaration.members.entries()) {
      const member = selectedSource.member;
      const input = member.proofInput;
      const owner = selectedSource.inherited?.source.definition;
      if (owner === undefined) {
        inherited.push(undefined);
        continue;
      }
      const native = host.projectTypeCatalog.definitionForDeclaration(owner.declaration);
      const ownerType = native === undefined ? undefined
        : host.projectTypeCatalog.targetTypeForDeclaration(native.declaration, native.typeParameterBindings);
      const selectedOwner = ownerType === undefined ? undefined
        : host.projectTypes().instantiateDeclarationType(owner.declaration, targetType, ownerType);
      if (selectedOwner?.kind !== "resolved" || selectedOwner.type.kind !== "target-named") return undefined;
      const inheritedSource = source.inherited[index];
      if (inheritedSource?.declaration !== selectedSource.inherited!.source) return failTargetAnalysisInvariant("tsonic-csharp",
        "Inherited native binding requires its original retained declaration source.", member.methodDeclaration);
      const application = formDeclarationApplication(selectedOwner.type, inheritedSource, nextState(declaration.state));
      if (application === undefined) return undefined;
      const selected = resolveCsharpObjectShapeMemberBySelectedSubject({
        members: application.source.members.map(row => row.proof),
      }, [...input.sourceSubjects ?? [], ...input.sourceDeclarations ?? []]);
      if (selected.kind !== "resolved") return undefined;
      const row = application.source.members.find(candidate => candidate.proof === selected.member);
      if (row === undefined || row.proof !== selectedSource.inherited!.member) return failTargetAnalysisInvariant("tsonic-csharp",
        "Inherited source proof selection requires its exact published member row.", member.methodDeclaration);
      inherited.push(Object.freeze({ application, member: row }));
    }
    return Object.freeze({ kind: "declaration", targetType, declaration, source, inherited: Object.freeze(inherited) });
  }

  function completeDeclarationApplication(
    application: CsharpProjectDeclarationApplication,
  ): CsharpObjectShapeFact | undefined {
    if (application.kind === "instance") {
      const template = completeDeclarationApplication(application.template);
      return template === undefined ? undefined : instantiateCsharpObjectShape(rememberTargetShape(template), application.targetType);
    }
    const { declaration, targetType } = application;
    const definition = host.projectTypeCatalog.definitionForDeclaration(declaration.definition.declaration);
    if (definition === undefined || definition.id !== declaration.definition.id) return failTargetAnalysisInvariant("tsonic-csharp",
      "Declaration completion requires its same published native header.", declaration.definition.declaration);
    const declared = completeSourceMembers(declaration.application, targetType);
    if (declared === undefined) return undefined;
    const substitutions = new Map(definition.typeParameterBindings.map((parameter, index) =>
      [parameter.identity, targetType.typeArguments![index]!]));
    const implemented = definition.kind === "interface" ? host.projectTypes().directSupertypes(targetType) : [];
    if (implemented === undefined) return undefined;
    const members: CsharpObjectShapeMemberFact[] = [];
    for (const [index, original] of declared.entries()) {
      let member = substituteObjectShapeMemberTargetTypeParameters(original, substitutions);
      const inherited = application.inherited[index];
      if (inherited !== undefined) {
        const completedShape = completeDeclarationApplication(inherited.application);
        const completed = completedShape === undefined ? undefined : rememberTargetShape(completedShape);
        if (completed === undefined) return undefined;
        const selected = resolveCsharpObjectShapeMemberBySelectedSubject(completed,
          [...member.sourceSubjects ?? [], ...member.sourceDeclarations ?? []]);
        if (selected.kind !== "resolved" || selected.member.memberKind !== "method") return undefined;
        const input = inherited.member.proof;
        if (selected.member.sourceSubjects !== input.sourceSubjects || selected.member.sourceDeclarations !== input.sourceDeclarations ||
          selected.member.sourceTypes !== input.sourceTypes || selected.member.sourceMemberEvidence !== input.sourceMemberEvidence ||
          selected.member.optional !== input.optional) return failTargetAnalysisInvariant("tsonic-csharp",
          "Inherited native completion requires the exact selected pre-child source proof row.", declaration.definition.declaration);
        const proof = application.source.members[index]!.proof;
        member = Object.freeze({ ...selected.member, sourceSubjects: proof.sourceSubjects,
          sourceMemberEvidence: proof.sourceMemberEvidence,
          ...(member.sourceTypes === undefined ? {} : { sourceTypes: proof.sourceTypes }),
        });
      }
      members.push(member);
    }
    return { targetType, sourceType: declaration.declaredType, members: Object.freeze(members),
      ...(definition.kind !== "class" ? {} : { constructible: declaration.initializable }),
      ...(implemented.length === 0 ? {} : { implements: implemented }),
    };
  }

  return Object.freeze({ nativeOwner, formDeclarationApplication, completeDeclarationApplication });
}
