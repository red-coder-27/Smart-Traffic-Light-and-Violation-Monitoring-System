import { Router } from "express";
import {
    changePassword,
    getCurrentUser,
    login,
    register,
} from "../controllers/authController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const authRoutes = Router();

authRoutes.post("/register", register);
authRoutes.post("/login", login);
authRoutes.get("/me", authMiddleware, getCurrentUser);
authRoutes.put("/change-password", authMiddleware, changePassword);

export default authRoutes;