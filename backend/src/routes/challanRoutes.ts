import { Router } from "express";
import {
    createChallan,
    getChallan,
    listChallans,
    simulatePayment,
} from "../controllers/challanController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const challanRoutes = Router();

challanRoutes.get("/", authMiddleware, requireRole("ADMIN", "TRAFFIC_POLICE", "CITIZEN"), listChallans);
challanRoutes.post("/", authMiddleware, requireRole("ADMIN", "TRAFFIC_POLICE"), createChallan);
challanRoutes.get("/:id", authMiddleware, requireRole("ADMIN", "TRAFFIC_POLICE", "CITIZEN"), getChallan);
challanRoutes.post("/:id/pay", authMiddleware, requireRole("ADMIN", "CITIZEN"), simulatePayment);

export default challanRoutes;
