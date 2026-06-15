import { registerCapability } from './registry';
import { projectCreateCapability } from './projectCreate';
import { activityCreateCapability } from './activityCreate';
import { scheduleUpdateCapability } from './scheduleUpdate';

registerCapability(projectCreateCapability);
registerCapability(activityCreateCapability);
registerCapability(scheduleUpdateCapability);
