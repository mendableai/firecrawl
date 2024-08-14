import express from "express";
import { redisHealthController } from "../controllers/admin/redis-health";
import {
  checkQueuesController,
  cleanBefore24hCompleteJobsController,
  queuesController,
} from "../controllers/admin/queue";

export const adminRouter = express.Router();

adminRouter.get(
  `/admin/${process.env.BULL_AUTH_KEY}/redis-health`,
  redisHealthController
);

adminRouter.get(
  `/admin/${process.env.BULL_AUTH_KEY}/clean-before-24h-complete-jobs`,
  cleanBefore24hCompleteJobsController
);

adminRouter.get(
  `/admin/${process.env.BULL_AUTH_KEY}/check-queues`,
  checkQueuesController
);

adminRouter.get(
  `/admin/${process.env.BULL_AUTH_KEY}/queues`,
  queuesController
);
