import type { Node, SourceFile } from "@tsonic/tsts";
import type { SourceFileSemantics, TargetSourceProgram } from "@tsonic/target-api/source";
import type { ResolvedSourceCallInfo } from "../../target-model/records/calls/source-calls.js";
import type { CsharpModuleCallableIdentities } from "../../target-model/records/callables/module-callables.js";
import type { CsharpCallableContractIndex } from "../../target-model/records/callables/callable-values.js";
import type { SourceCallableContract } from "../../target-model/records/callables/source-callable-contract.js";
import type { CsharpProjectTypePolicy } from "../../target-model/records/types/project-types.js";

interface CsharpSourceCallableDeclarationSource {
  readonly declaration: Node | undefined;
  readonly project: boolean;
}

export interface CsharpSourceCallableSource {
  readonly source: ResolvedSourceCallInfo;
  readonly sourceFile: SourceFile;
  readonly queries: SourceFileSemantics;
  readonly module: {
    readonly reference: ReturnType<TargetSourceProgram["navigation"]["sourceReferenceFor"]>;
    readonly declaration: Node | undefined;
    readonly initializer: Node | undefined;
    readonly selected: Node | undefined;
    readonly project: boolean;
  };
  readonly constructorDeclaration: Node | undefined;
  readonly checked: CsharpSourceCallableDeclarationSource;
  readonly implementation: CsharpSourceCallableDeclarationSource & {
    readonly selection: ReturnType<TargetSourceProgram["navigation"]["callableImplementation"]>;
  };
}

export function formCsharpSourceCallableSource(
  input: Pick<TargetSourceProgram, "ast" | "navigation" | "semantics">,
  moduleCallables: CsharpModuleCallableIdentities,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): CsharpSourceCallableSource {
  const queries = input.semantics.forFile(sourceFile);
  const reference = input.navigation.sourceReferenceFor(source.sourceCallee.expression);
  const declaration = reference?.declaration ?? source.sourceCalleeAccess?.declaration ?? source.sourceCallee.declaration;
  const initializer = declaration === undefined ? undefined : moduleCallables.get(declaration)?.callable;
  const selected = source.sourceCalleeAccess?.selectedDeclaration ?? source.sourceCallee.selectedDeclaration;
  const selectedCallee = source.sourceCallee.selectedDeclaration;
  const selectedDeclaration = queries.declarations.signatureDeclaration(source.selectedSignature);
  const implementation = selectedDeclaration === undefined ? undefined
    : input.navigation.callableImplementation(selectedDeclaration);
  const implementationDeclaration = implementation?.kind === "resolved"
    ? implementation.implementation.declaration : selectedDeclaration;
  return Object.freeze({ source, sourceFile, queries,
    module: Object.freeze({ reference, declaration, initializer, selected,
      project: initializer !== undefined && selected !== undefined && input.navigation.isProjectDeclaration(selected),
    }),
    constructorDeclaration: selectedCallee !== undefined && input.ast.is.IsClassDeclaration(selectedCallee)
      ? selectedCallee : undefined,
    checked: Object.freeze({ declaration: selectedDeclaration,
      project: selectedDeclaration !== undefined && input.navigation.isProjectDeclaration(selectedDeclaration),
    }),
    implementation: Object.freeze({ selection: implementation, declaration: implementationDeclaration,
      project: implementationDeclaration !== undefined && input.navigation.isProjectDeclaration(implementationDeclaration),
    }),
  });
}

export function completeCsharpSourceCallableSource(
  input: CsharpSourceCallableSource,
  selection: "checked" | "implementation",
  host: {
    readonly contracts: CsharpCallableContractIndex | undefined;
    projectTypes(): CsharpProjectTypePolicy | undefined;
  },
): SourceCallableContract | undefined {
  const { contracts } = host;
  if (contracts === undefined) return undefined;
  if (selection === "implementation" && input.module.initializer !== undefined) {
    const { declaration, initializer, selected, project } = input.module;
    return selected === undefined || selected !== declaration && selected !== initializer || !project
      ? undefined : contracts.get({ kind: "declaration", declaration: initializer });
  }
  if (input.constructorDeclaration !== undefined) {
    const constructor = host.projectTypes()?.implicitConstructorForSignature(input.constructorDeclaration,
      input.source.selectedSignature, input.source.sourceSelectedSignatureParameters);
    if (constructor !== undefined) return contracts.get({ kind: "project-constructor", targetMemberId: constructor.targetMember.id });
  }
  const selected = selection === "implementation" ? input.implementation : input.checked;
  return selected.declaration !== undefined && selected.project
    ? contracts.get({ kind: "declaration", declaration: selected.declaration }) : undefined;
}
