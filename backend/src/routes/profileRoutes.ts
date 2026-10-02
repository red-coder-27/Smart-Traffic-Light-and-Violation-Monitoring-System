import { Router } from "express";
import { getProfile, updateProfile } from "../controllers/profileController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const profileRoutes = Router();

profileRoutes.get("/", authMiddleware, getProfile);
profileRoutes.put("/", authMiddleware, updateProfile);

export default profileRoutes;
