import { registerCapability } from './registry';
import { projectCreateCapability } from './projectCreate';
import { activityCreateCapability } from './activityCreate';
import { scheduleUpdateCapability } from './scheduleUpdate';
import { projectUpdateCapability } from './projectUpdate';
import { riskUpdateCapability } from './riskUpdate';

registerCapability(projectCreateCapability);
registerCapability(activityCreateCapability);
registerCapability(scheduleUpdateCapability);
registerCapability(projectUpdateCapability);
registerCapability(riskUpdateCapability);
