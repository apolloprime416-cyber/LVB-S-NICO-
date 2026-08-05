import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import meRouter from "./me";
import adminRouter from "./admin";
import publicRouter from "./public";
import paymentsRouter from "./payments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(meRouter);
router.use(adminRouter);
router.use(publicRouter);
router.use(paymentsRouter);

export default router;
