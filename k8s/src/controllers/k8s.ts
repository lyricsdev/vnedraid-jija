import express, { response, type Request, type Response } from "express";
import path from "path";
import { NodeSSH } from "node-ssh";
import { prisma } from "../service/prisma";
import { ensureSSHKeyPair } from "../service/sshInitService";
import { getClusterInfo } from "../service/cluster/k8s";
enum ClusterType {
  Master = "master",
  Minion = "minion",
}

const router = express.Router();
function getClusterTypeFromString(value: string): string | null {
  const mapping: Record<string, string> = {
    master: ClusterType.Master,
    minion: ClusterType.Minion,
  };

  return mapping[value.toLowerCase()] ?? null;
}

router.post("/new/:type", async (req: Request, res: Response) => {
  const { ip, user, password,projectId } = req.body;
  const { type } = req.params;
  console.log(req.body)
  if (type !== "master" && type !== "minion") {
    res
      .status(400)
      .send({ error: 'Invalid type parameter. Must be "master" or "minion".' });
    return;
  }

  if (!ip || !user || !password) {
    res.status(400).send({ error: "Необходимо указать ip, user, password" });
    return;
  }

  if (!ip || !user || !password) {
    res.status(400).send({ error: "Необходимо указать ip, user, password" });
    return;
  }
  if(!projectId) {
    res.status(400).send({ error: "Нет проекта" });
    return;
  }
  const project = await prisma.project.findFirst({
    where: {
      id: projectId
    }
  })
  if(!project) {
    res.status(400).send({ error: "Проект не найден" });
    return;
  }
  const ssh = new NodeSSH();

  try {
    await ensureSSHKeyPair();

    const scriptPath = path.resolve(__dirname, `../../scripts/init-${type}.sh`);

    await ssh.connect({ host: ip, username: user, password });
    const remotePath = `/tmp/init-${type}.sh`;

    await ssh.putFile(scriptPath, remotePath);
    await ssh.execCommand(`chmod +x ${remotePath} && ${remotePath}`).then(async(val)=> {
      const data =  JSON.parse(val.stdout);
      await prisma.cluster.create({
        data: {
          project: {
            connect: {
              id: project.id
            }
          },
          ip,
          username: user,
              type: getClusterTypeFromString(type) ?? "master"
          }
      })
      res.json({ 
        status: "ok", 
        message: `Скрипт для ${type} успешно выполнен`,
        resp: JSON.parse(val.stdout)
      });
    }).catch((e)=>{console.log("bruh:" + e)}).finally(()=> {
      ssh.dispose()
    });
    
    return;
  } catch (err) {
    console.error("Ошибка SSH:", err);
    res.status(500).json({ error: "Ошибка при настройке узла", details: err });
  }
});
router.get("/clusterInfo/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  const data = await prisma.cluster.findFirst({
    where: {
      id: Number(id)
    }
  })
  if(!data) {
      res.json({
        message: "кластер не найден!",
        code: 404
      })
      return;
  }
  const clusterInfo = await getClusterInfo(`https://${data.ip}:6443`)
  res.json(clusterInfo);
  return;
})
export default router;
