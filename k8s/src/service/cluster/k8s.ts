import { KubeConfig, AppsV1Api, CoreV1Api, V1PodList, V1Namespace } from '@kubernetes/client-node';
const TOKEN = "eyJhbGciOiJSUzI1NiIsImtpZCI6Ikt6LTNKT0pzRVotRlFFOUtGTXd1OWo1bldVREhnLTlfRzlhZWhUVEFrS2MifQ.eyJpc3MiOiJrdWJlcm5ldGVzL3NlcnZpY2VhY2NvdW50Iiwia3ViZXJuZXRlcy5pby9zZXJ2aWNlYWNjb3VudC9uYW1lc3BhY2UiOiJkZWZhdWx0Iiwia3ViZXJuZXRlcy5pby9zZXJ2aWNlYWNjb3VudC9zZWNyZXQubmFtZSI6ImFkbWluLWFwaS10b2tlbiIsImt1YmVybmV0ZXMuaW8vc2VydmljZWFjY291bnQvc2VydmljZS1hY2NvdW50Lm5hbWUiOiJhZG1pbi1hcGkiLCJrdWJlcm5ldGVzLmlvL3NlcnZpY2VhY2NvdW50L3NlcnZpY2UtYWNjb3VudC51aWQiOiI5ZDBkOGM5ZC1lNGE2LTRlNzgtOWZhMy0yNTVlZWRjYjlkZDAiLCJzdWIiOiJzeXN0ZW06c2VydmljZWFjY291bnQ6ZGVmYXVsdDphZG1pbi1hcGkifQ.kM-G21FBJ0kG6w_C-p3SPuZk0d6T_J8w5qGsoT7ZJE0_guqdh34PaT0DQ2pp8OMSQpO6uHDQs8JCI4PJU0mCTVfOeAbIH5w05E1Q7-l0Aj37WtB_dWI_TkfRs4iLlapMUF1GR1ZcrohPwz3Or0wvU8vHx4FcQpWWKpQCkqmAN6P3VpMySYxdNM_qyXFsDuwth1mWSeDAwrIDuBrHCkySjj8xmOZbvh8HsvErmaKd4aHCtrVy1TKc38qaPIjGBp60ry2kIBz2lXxc9Ke-ZAamyah5l8AunJdueUzbz1zxhsH-UXh0qUfXp1cHwXfghdIMWWm7FPEsUHWqxcKDdbYbWQ"
export async function createK8sClient(server: string,token: string = TOKEN) {
    const kc = new KubeConfig();
    
    kc.loadFromOptions({
        apiVersion: 'v1',
        clusters: [{
            name: 'my-cluster',
            server: server,
            skipTLSVerify: true // Только для тестов, в проде используйте правильные сертификаты
        }],
        users: [{
            name: 'admin-api',
            token: token
        }],
        contexts: [{
            name: 'my-context',
            user: 'admin-api',
            cluster: 'my-cluster'
        }],
        currentContext: 'my-context'
    });

    return {
        coreV1Api: kc.makeApiClient(CoreV1Api),
        appsV1Api: kc.makeApiClient(AppsV1Api),
        kubeConfig: kc
    };
}

type K8sClient = Awaited<ReturnType<typeof createK8sClient>>;
interface PodListOptions {
    namespace?: string;
    labelSelector?: string;
    limit?: number;
}

export async function getClusterInfo(server: string) {
    const { coreV1Api, appsV1Api } = await createK8sClient(server);

    try {
        const [podsRes, nodesRes, servicesRes, deploymentsRes] = await Promise.all([
            coreV1Api.listPodForAllNamespaces(),
            coreV1Api.listNode(),
            coreV1Api.listServiceForAllNamespaces(),
            appsV1Api.listDeploymentForAllNamespaces(),
        ]);

        return {
            pods: podsRes.items.map(pod => ({
                name: pod.metadata?.name,
                namespace: pod.metadata?.namespace,
                status: pod.status?.phase,
                ip: pod.status?.podIP,
                nodeName: pod.spec?.nodeName,
                containers: pod.spec?.containers?.map(c => ({
                    name: c.name,
                    image: c.image
                })),
                labels: pod.metadata?.labels,
                createdAt: pod.metadata?.creationTimestamp,
            })),
            nodes: nodesRes.items.map(node => ({
                name: node.metadata?.name,
                status: node.status?.conditions?.find(c => c.type === 'Ready')?.status,
                capacity: node.status?.capacity,
                allocatable: node.status?.allocatable,
                labels: node.metadata?.labels,
            })),
            services: servicesRes.items.map(svc => ({
                name: svc.metadata?.name,
                namespace: svc.metadata?.namespace,
                type: svc.spec?.type,
                clusterIP: svc.spec?.clusterIP,
                ports: svc.spec?.ports,
                selector: svc.spec?.selector
            })),
            deployments: deploymentsRes.items.map(dep => ({
                name: dep.metadata?.name,
                namespace: dep.metadata?.namespace,
                replicas: dep.spec?.replicas,
                availableReplicas: dep.status?.availableReplicas,
                labels: dep.metadata?.labels,
                containers: dep.spec?.template?.spec?.containers?.map(c => ({
                    name: c.name,
                    image: c.image
                })),
                createdAt: dep.metadata?.creationTimestamp,
            })),
        };
    } catch (err) {
        console.error('❌ Ошибка при сборе информации:', err);
        throw err;
    }
}
export async function createNamespace(coreApi: CoreV1Api, name: string) {
  const ns: V1Namespace = {
    metadata: { name }
  };

  try {
    await coreApi.createNamespace({ body: ns });
  } catch (e: any) {
    if (e.body?.reason !== 'AlreadyExists') throw e;
  }
}