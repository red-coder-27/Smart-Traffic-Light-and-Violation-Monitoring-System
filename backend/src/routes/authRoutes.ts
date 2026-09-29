import { Router } from "express";
import { getCurrentUser, login, register } from "../controllers/authController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const authRoutes = Router();

authRoutes.post("/register", register);
authRoutes.post("/login", login);
authRoutes.get("/me", authMiddleware, getCurrentUser);

export default authRoutes;