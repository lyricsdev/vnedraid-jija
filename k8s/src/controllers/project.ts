import express, { response, type Request, type Response } from "express";
import path from "path";
import { NodeSSH } from "node-ssh";
import fs from "fs-extra";
import { prisma } from "../service/prisma";
import { ensureSSHKeyPair } from "../service/sshInitService";
import { createProject, getClusterProjects, getProjectForUser } from "../service/projects/project.service";

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
router.post("/list", async (req: Request, res: Response) => {
    const { userId} = req.body;
    const data = await getProjectForUser(userId)
    res.json(data)
    return;
});
router.post("/clusterlist", async (req: Request, res: Response) => {
    const {projectId} = req.body;
    const data = await getClusterProjects(projectId)
    res.json(data)
    return;
});
export default router;
