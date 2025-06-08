import express, { response, type Request, type Response } from "express";
import path from "path";
import { NodeSSH } from "node-ssh";
import { ensureSSHKeyPair } from "../service/sshInitService";
import { createK8sClient, createNamespaceCluster, deleteNamespace, deployHelloWorld, deployPrometheus, getClusterInfo, getClustetById, getDeployments, getNamespaces, getNamespacesDeployments, scaleDeployment } from "../service/cluster/k8s";
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
  
  try { 
    const ssh = new NodeSSH();

    await ensureSSHKeyPair();

    const scriptPath = path.resolve(__dirname, `../../scripts/init-${type}.sh`);

    await ssh.connect({ host: ip, username: user, password });
    const remotePath = `/tmp/init-${type}.sh`;
    console.log(remotePath)
    await ssh.putFile(scriptPath, remotePath)
    await ssh.execCommand(`chmod +x ${remotePath} && ${remotePath}`).then(async(val)=> {
      console.log(val)
      const data =JSON.parse(val.stdout);
      await prisma.cluster.create({
        data: {
          project: {
            connect: {
              id: project.id
            }
          },
          ip,
          token: data.api_token,
          joinCommand: data.join_command,
          username: user,
          type: getClusterTypeFromString(type) ?? "master"
          }
      })
      
      res.json({ 
        status: "ok", 
        message: `Скрипт для ${type} успешно выполнен`,
        resp: JSON.parse(val.stdout)
      });
      return;
    }).catch((e)=>{console.log("bruh:" + e)}).finally(()=> {
      ssh.dispose()
    });
    
    return;
  } catch (err) {
    console.error("Ошибка SSH:", err);
    res.status(500).json({ error: "Ошибка при настройке узла", details: err });
    return;
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
  const clusterInfo = await getClusterInfo(`https://${data.ip}:6443`,data.token!!)
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

    const clusterInfo = await deployPrometheus(`https://${cluster.ip}:6443`,cluster.token!!)

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

    const result = await deployHelloWorld(`https://${cluster.ip}:6443`,cluster.token!!);

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
  res.json(await getNamespaces(`https://${cluster.ip}:6443`,cluster.token!!))
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

  const success = await createNamespaceCluster(`https://${cluster.ip}:6443`, namespace,cluster.token!!);
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

  const success = await deleteNamespace(`https://${cluster.ip}:6443`, namespace,cluster.token!!);
  if (success) {
    res.json({ success: true, message: `Namespace '${namespace}' удалён` });
    return 
  } else {
    res.status(500).json({ success: false, message: "Ошибка при удалении namespace" });
    return 
  }
});
router.get("/:id/deployments/:namespace", async (req: Request, res: Response) => {
  const { id, namespace } = req.params;

  const cluster = await prisma.cluster.findFirst({ where: { id: Number(id) } });
  if (!cluster) {
     res.status(404).json({ success: false, error: 404, message: "Кластер не найден" });
     return 
  }

  try {
    const { coreV1Api,appsV1Api } = await createK8sClient(`https://${cluster.ip}:6443`,cluster.token!!);
    const depList = await appsV1Api.listNamespacedDeployment({ namespace });

const deployments = await Promise.all((depList.items || []).map(async (dep) => {
  const namespace = dep.metadata?.namespace || '';
  const selectorLabels = dep.spec?.selector?.matchLabels || {};

  // Формируем селектор для запроса подов, например: "app=grafana,pod-template-hash=123"
  const labelSelector = Object.entries(selectorLabels)
    .map(([k, v]) => `${k}=${v}`)
    .join(',');

  // Получаем поды по селектору
  const podsResponse = await coreV1Api.listNamespacedPod({namespace, labelSelector});
  const pods = podsResponse.items;

  const podLabelsSet = new Set<string>();
  pods.forEach(pod => {
    const labels = pod.metadata?.labels || {};
    Object.entries(labels).forEach(([k, v]) => {
      podLabelsSet.add(`${k}=${v}`);
    });
  });

  // Формируем объект с лейблами для ответа (преобразуем Set обратно в объект)
  const podLabelsObj: Record<string, string> = {};
  podLabelsSet.forEach(label => {
    const [key, value] = label.split('=');
    podLabelsObj[key] = value;
  });

  return {
    metadata: {
      name: dep.metadata?.name,
      namespace,
      resourceVersion: dep.metadata?.resourceVersion,
      uid: dep.metadata?.uid,
      labels: selectorLabels,
      podLabels: podLabelsObj, // реальные лейблы подов
    }
  };
}));


    res.json({ success: true, deployments });
    return 
  } catch (error) {
    console.error('Error listing deployments:', error);
    res.status(500).json({ success: false, message: "Ошибка при получении деплойментов" });
    return 
  }
});
router.get("/:id/namespaces-with-deployments", async (req: Request, res: Response) => {
  const { id } = req.params;

  const cluster = await prisma.cluster.findFirst({ where: { id: Number(id) } });
  if (!cluster) {
    res.status(404).json({ success: false, message: "Кластер не найден" });
    return;
  }

  const server = `https://${cluster.ip}:6443`;

  try {
    const namespaces = await getNamespacesDeployments(server,cluster.token!!);
    const result = await Promise.all(
      namespaces.map(async (ns) => {
        const deployments = await getDeployments(server, ns,cluster.token!!);
        return { namespace: ns, deployments };
      })
    );

    res.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Ошибка при получении данных" });
  }
});
router.post("/:id/scale-deployment", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { namespace, name, replicas } = req.body;

  if (!namespace || !name || typeof replicas !== "number") {
    res.status(400).json({ success: false, message: "Поля namespace, name, replicas обязательны" });
    return;
  }

  const cluster = await prisma.cluster.findFirst({ where: { id: Number(id) } });
  if (!cluster) {
    res.status(404).json({ success: false, message: "Кластер не найден" });
    return;
  }

  const server = `https://${cluster.ip}:6443`;
  const ok = await scaleDeployment(server, namespace, name, replicas,cluster.token!!);
  res.json({ success: ok });
});
router.get("/:id/metrics", async (req: Request, res: Response) => {
  const { id } = req.params;
  const cluster = await prisma.cluster.findFirst({ where: { id: Number(id) } });

  if (!cluster) {
    res.status(404).json({ success: false, message: "Кластер не найден" });
    return;
  }

  const prometheusUrl = `http://${cluster.ip}:30090/api/v1/query`; // Порт Prometheus
  const query = req.query.query;

  if (!query) {
    res.status(400).json({ success: false, message: "Параметр 'query' обязателен" });
    return;
  }

  try {
    const result = await fetch(`${prometheusUrl}?query=${encodeURIComponent(String(query))}`);
    const data = await result.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Ошибка при запросе к Prometheus" });
  }
});

export default router;
