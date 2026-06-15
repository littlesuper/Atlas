import { registerCapability } from './registry';
import { projectCreateCapability } from './projectCreate';
import { activityCreateCapability } from './activityCreate';

registerCapability(projectCreateCapability);
registerCapability(activityCreateCapability);
