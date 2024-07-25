import express from "express";
import { redisHealthController } from "../controllers/admin/redis-health";
import {
  checkQueuesController,
  cleanBefore24hCompleteJobsController,
  queuesController,
} from "../controllers/admin/queue";

export const adminRouter = express.Router();

adminRouter.post(
  `/admin/${process.env.BULL_AUTH_KEY}/redis-health`,
  redisHealthController
);

adminRouter.post(
  `/admin/${process.env.BULL_AUTH_KEY}/clean-before-24h-complete-jobs`,
  cleanBefore24hCompleteJobsController
);

adminRouter.post(
  `/admin/${process.env.BULL_AUTH_KEY}/check-queues`,
  checkQueuesController
);

adminRouter.post(
  `/admin/${process.env.BULL_AUTH_KEY}/queues`,
  queuesController
);
