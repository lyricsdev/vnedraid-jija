import express, { response, type Request, type Response } from "express";
import path from "path";
import { NodeSSH } from "node-ssh";
import fs from "fs-extra";
import { prisma } from "../service/prisma";
import { ensureSSHKeyPair } from "../service/sshInitService";
import { createProject, getProjectForUser } from "../service/projects/project.service";

const router = express.Router();

router.post("/create", async (req: Request, res: Response) => {
    const { username,userId,projectName} = req.body;
    const data = await createProject({
        name: projectName,
        userId: userId,
        username: username
    })
    if(!data) {
        res.json(
            {
                code: 504,
                message: "Произошла ошибка при создании проекта"
            }
        )
        return;
    }
     res.json({
        collection: data,
        code: 200
    })
    return;
});
router.get("/list", async (req: Request, res: Response) => {
    const { userId} = req.body;
    const data = await getProjectForUser(userId)
    res.json(data)
    return;
});
export default router;
