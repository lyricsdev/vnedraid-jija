import express, { response, type Request, type Response } from "express";
import path from "path";
import { NodeSSH } from "node-ssh";
import { ensureSSHKeyPair } from "../service/sshInitService";
import { createNamespaceCluster, deleteNamespace, deployHelloWorld, deployPrometheus, getClusterInfo, getClustetById, getNamespaces } from "../service/cluster/k8s";
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
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

router.post("/metric/install",  async (req: Request, res: Response) => {
  const { clusterId } = req.body;

  try {
    const cluster = await prisma.cluster.findFirst({
      where: { id: clusterId }
    });

    if (!cluster) {
      res.status(404).json({ success: false, error: 404,message: "Кластер не найден" });
      return;
    }

    const clusterInfo = await deployPrometheus(`https://${cluster.ip}:6443`)

    res.json({ success: true, ...clusterInfo });
    return;
  } catch (e) {
    console.error("Prometheus deploy error:", e);
    res.status(500).json({ success: false, error: 504,message:e });
    return;
  }
});
router.post("/deploy", async (req: Request, res: Response) => {
  const { clusterId } = req.body;

  try {
    const cluster = await prisma.cluster.findFirst({
      where: { id: clusterId }
    });

    if (!cluster) {
      res.status(404).json({ success: false, error: 404, message: "Кластер не найден" });
      return;
    }

    const result = await deployHelloWorld(`https://${cluster.ip}:6443`);

    res.json({ success: true, ...result });
  } catch (e) {
    console.error("Hello World deploy error:", e);
    res.status(500).json({ success: false, error: 500, message: e instanceof Error ? e.message : String(e) });
  }
});

router.post("/getclusterbyid", async (req: Request, res: Response) => {
  const { clusterId } = req.body;
  if(!clusterId) {
    res.json({
      code: 404,
      message: "кластер не найден"
    })
    return;
  }
  res.json(await getClustetById(clusterId))
});

router.get("/:id/namespaces", async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const cluster = await prisma.cluster.findFirst({
      where: { id: Number(id) }
    });

    if (!cluster) {
      res.status(404).json({ success: false, error: 404, message: "Кластер не найден" });
      return;
    }
  res.json(await getNamespaces(`https://${cluster.ip}:6443`))
});

router.post("/:id/namespaces", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { namespace } = req.body;

  if (!namespace || typeof namespace !== 'string') {
    res.status(400).json({ success: false, message: "Требуется поле 'namespace' в теле запроса" });
    return 
  }

  const cluster = await prisma.cluster.findFirst({ where: { id: Number(id) } });
  if (!cluster) {
    res.status(404).json({ success: false, error: 404, message: "Кластер не найден" });
    return 
  }

  const success = await createNamespaceCluster(`https://${cluster.ip}:6443`, namespace);
  if (success) {
    res.json({ success: true, message: `Namespace '${namespace}' создан` });
    return 
  } else {
    res.status(500).json({ success: false, message: "Ошибка при создании namespace" });
    return 
  }
});

router.delete("/:id/namespaces/:namespace", async (req: Request, res: Response) => {
  const { id, namespace } = req.params;

  const cluster = await prisma.cluster.findFirst({ where: { id: Number(id) } });
  if (!cluster) {
     res.status(404).json({ success: false, error: 404, message: "Кластер не найден" });
     return 
  }

  const success = await deleteNamespace(`https://${cluster.ip}:6443`, namespace);
  if (success) {
    res.json({ success: true, message: `Namespace '${namespace}' удалён` });
    return 
  } else {
    res.status(500).json({ success: false, message: "Ошибка при удалении namespace" });
    return 
  }
});
export default router;
