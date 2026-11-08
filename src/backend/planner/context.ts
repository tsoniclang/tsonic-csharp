import type { CsharpTargetProgram } from "../../target-model/records/target-program.js";
import type { CsharpPlanningContext, CsharpPlanningNames } from "./planning-data.js";
import { createCsharpSyntheticNames } from "./names/synthetic.js";
import { planExpression, planCallArgument } from "./expressions/planning.js";
import { planStatements, planBlockStatements } from "./statements/planning.js";

const dispatch = Object.freeze({ planExpression, planCallArgument, planStatements, planBlockStatements });

export function createCsharpPlanningContext(program: CsharpTargetProgram): CsharpPlanningContext {
  const inventory = program.records.nameInventory.get();
  const names: CsharpPlanningNames = createCsharpSyntheticNames(inventory.reservedNames);
  return Object.freeze({ dispatch, host: program.host, program: Object.freeze({ source: Object.freeze({ ast: program.source.ast }), records: program.records }),
    names, scope: Object.freeze({ typeParameterNames: new Map(inventory.typeParameterNames.map(parameter => [parameter.identity, parameter.name])) }) });
}
