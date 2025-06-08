import { KubeConfig, AppsV1Api, CoreV1Api, V1PodList, V1Namespace, RbacAuthorizationV1Api } from '@kubernetes/client-node';
import { prisma } from '../../service/prisma';
import axios from 'axios';
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
        rbacAuthorizationV1Api: kc.makeApiClient(RbacAuthorizationV1Api),

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
export async function createNamespace(coreV1Api: CoreV1Api, name: string) {
  try {
    await coreV1Api.createNamespace({
      body: {
        metadata: { name },
      },
    });
    console.log(`Namespace "${name}" created`);
  } catch (e: any) {
    if (e?.response?.statusCode === 409) {
      console.log(`Namespace "${name}" already exists`);
    } else {
      throw e;
    }
  }
}

export async function cleanupKubeStateMetricsResources(
  namespace: string,
  coreV1Api: CoreV1Api,
  rbacAuthorizationV1Api: RbacAuthorizationV1Api
) {
  const safeDelete = async (fn: () => Promise<any>, desc: string) => {
    try {
      await fn();
      console.log(`${desc} deleted`);
    } catch (e: any) {
      if (e?.body?.code === 404) {
        console.warn(`${desc} not found or already deleted`);
      } else {
        console.error(`Error deleting ${desc}:`, e.body?.message || e.message);
      }
    }
  };

  await safeDelete(
    () => coreV1Api.deleteNamespacedServiceAccount({ name: 'kube-state-metrics', namespace }),
    'ServiceAccount kube-state-metrics'
  );

  await safeDelete(
    () => coreV1Api.deleteNamespacedServiceAccount({ name: 'monitoring-sa', namespace }),
    'ServiceAccount monitoring-sa'
  );

  await safeDelete(
    () => rbacAuthorizationV1Api.deleteClusterRole({ name: 'kube-state-metrics' }),
    'ClusterRole kube-state-metrics'
  );

  await safeDelete(
    () => rbacAuthorizationV1Api.deleteClusterRole({ name: 'monitoring-cluster-role' }),
    'ClusterRole monitoring-cluster-role'
  );

  await safeDelete(
    () => rbacAuthorizationV1Api.deleteClusterRoleBinding({ name: 'monitoring-cluster-role' }),
    'ClusterRoleBinding monitoring-cluster-role'
  );

  await safeDelete(
    () => rbacAuthorizationV1Api.deleteClusterRoleBinding({ name: 'kube-state-metrics' }),
    'ClusterRoleBinding kube-state-metrics'
  );

  await safeDelete(
    () => rbacAuthorizationV1Api.deleteClusterRoleBinding({ name: 'default-monitoring-binding' }),
    'ClusterRoleBinding default-monitoring-binding'
  );

  await safeDelete(
    () => rbacAuthorizationV1Api.deleteClusterRoleBinding({ name: 'monitoring-sa-binding' }),
    'ClusterRoleBinding monitoring-sa-binding'
  );
}



export async function deployPrometheus(server: string) {
  const { coreV1Api, appsV1Api,rbacAuthorizationV1Api } = await createK8sClient(server);
  const namespace = 'monitoring';
        await cleanupKubeStateMetricsResources(namespace, coreV1Api, rbacAuthorizationV1Api);
  await createNamespace(coreV1Api, namespace);

  // === ServiceAccount for kube-state-metrics ===
  await coreV1Api.createNamespacedServiceAccount({
    namespace,
    body: {
      apiVersion: 'v1',
      kind: 'ServiceAccount',
      metadata: { name: 'kube-state-metrics' }
    }
  });
  await coreV1Api.createNamespacedServiceAccount({
  namespace,
  body: {
    apiVersion: 'v1',
    kind: 'ServiceAccount',
    metadata: { name: 'monitoring-sa' }
  }
});
await rbacAuthorizationV1Api.createClusterRole({
  body: {
    metadata: { name: 'monitoring-cluster-role' },
    rules: [
      {
        apiGroups: [''],
        resources: ['pods', 'nodes', 'services', 'endpoints'],
        verbs: ['get', 'list', 'watch']
      }
    ]
  }
});
await rbacAuthorizationV1Api.createClusterRoleBinding({
  body: {
    metadata: { name: 'default-monitoring-binding' },
    roleRef: {
      kind: 'ClusterRole',
      name: 'monitoring-cluster-role',
      apiGroup: 'rbac.authorization.k8s.io',
    },
    subjects: [{
      kind: 'ServiceAccount',
      name: 'default',
      namespace: 'monitoring',
    }],
  }
});

await rbacAuthorizationV1Api.createClusterRoleBinding({
  body: {
    metadata: { name: 'monitoring-sa-binding' },
    roleRef: {
      kind: 'ClusterRole',
      name: 'monitoring-cluster-role',
      apiGroup: 'rbac.authorization.k8s.io'
    },
    subjects: [{
      kind: 'ServiceAccount',
      name: 'monitoring-sa',
      namespace
    }]
  }
});

await rbacAuthorizationV1Api.createClusterRole({
  body: {
    metadata: { name: 'kube-state-metrics' },
    rules: [
      {
        apiGroups: [""],
        resources: [
          "configmaps", "secrets", "nodes", "pods", "services",
          "resourcequotas", "replicationcontrollers", "limitranges",
          "persistentvolumeclaims", "persistentvolumes", "namespaces", "endpoints"
        ],
        verbs: ["list", "watch"]
      },
      {
        apiGroups: ["apps"],
        resources: [
          "statefulsets", "daemonsets", "deployments", "replicasets"
        ],
        verbs: ["list", "watch"]
      },
      {
        apiGroups: ["batch"],
        resources: ["jobs", "cronjobs"],
        verbs: ["list", "watch"]
      },
      {
        apiGroups: ["autoscaling"],
        resources: ["horizontalpodautoscalers"],
        verbs: ["list", "watch"]
      },
      {
        apiGroups: ["policy"],
        resources: ["poddisruptionbudgets"],
        verbs: ["list", "watch"]
      },
      {
        apiGroups: ["certificates.k8s.io"],
        resources: ["certificatesigningrequests"],
        verbs: ["list", "watch"]
      },
      {
        apiGroups: ["storage.k8s.io"],
        resources: ["storageclasses"],
        verbs: ["list", "watch"]
      },
      {
        apiGroups: ["admissionregistration.k8s.io"],
        resources: ["mutatingwebhookconfigurations", "validatingwebhookconfigurations"],
        verbs: ["list", "watch"]
      },
      {
        apiGroups: ["rbac.authorization.k8s.io"],
        resources: ["roles", "rolebindings", "clusterroles", "clusterrolebindings"],
        verbs: ["list", "watch"]
      }
    ]
  }
});


  await rbacAuthorizationV1Api.createClusterRoleBinding({
    body: {
      metadata: { name: 'kube-state-metrics' },
      roleRef: { kind: 'ClusterRole', name: 'kube-state-metrics', apiGroup: 'rbac.authorization.k8s.io', },
      subjects: [{ kind: 'ServiceAccount', name: 'kube-state-metrics', namespace }]
    }
  });



  // === Prometheus ConfigMap ===
  const configMap = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name: 'prometheus-config', namespace },
    data: {
      'prometheus.yml': `
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter-service.monitoring.svc.cluster.local:9100']

  - job_name: 'kube-state-metrics-static'
    static_configs:
      - targets: ['kube-state-metrics.monitoring.svc.cluster.local:8080']

  - job_name: 'kube-state-metrics'
    kubernetes_sd_configs:
      - role: endpoints
    relabel_configs:
      - source_labels: [__meta_kubernetes_service_name, __meta_kubernetes_namespace]
        action: keep
        regex: kube-state-metrics;monitoring

`
    }
  };
  await coreV1Api.createNamespacedConfigMap({ namespace, body: configMap });

  // === Prometheus Deployment ===
  const prometheusDeployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    serviceAccountName: 'monitoring-sa',
    metadata: { name: 'prometheus', namespace },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'prometheus' } },
      template: {
        metadata: { labels: { app: 'prometheus' } },
        spec: {
          containers: [{
            name: 'prometheus',
            image: 'prom/prometheus:latest',
            args: ['--config.file=/etc/prometheus/prometheus.yml'],
            ports: [{ containerPort: 9090 }],
            volumeMounts: [{
              name: 'config',
              mountPath: '/etc/prometheus'
            }]
          }],
          volumes: [{
            name: 'config',
            configMap: { name: 'prometheus-config' }
          }],
          tolerations: [{
            key: "node-role.kubernetes.io/control-plane",
            operator: "Exists",
            effect: "NoSchedule"
          }]
        }
      }
    }
  };
  await appsV1Api.createNamespacedDeployment({ namespace, body: prometheusDeployment });

  const prometheusService = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'prometheus-service', namespace },
    spec: {
      selector: { app: 'prometheus' },
      type: 'NodePort',
      ports: [{ port: 9090, targetPort: 9090, nodePort: 30090 }]
    }
  };
  await coreV1Api.createNamespacedService({ namespace, body: prometheusService });

  // === Node Exporter ===
  const nodeExporterDeployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'node-exporter', namespace },
    spec: {
      serviceAccountName: 'monitoring-sa',
      replicas: 1,
      selector: { matchLabels: { app: 'node-exporter' } },
      template: {
        metadata: { labels: { app: 'node-exporter' } },
        spec: {
          containers: [{
            name: 'node-exporter',
            image: 'prom/node-exporter',
            ports: [{ containerPort: 9100 }]
          }],
          tolerations: [{
            key: "node-role.kubernetes.io/control-plane",
            operator: "Exists",
            effect: "NoSchedule"
          }]
        }
      }
    }
  };
  await appsV1Api.createNamespacedDeployment({ namespace, body: nodeExporterDeployment });

  const nodeExporterService = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'node-exporter-service', namespace },
    spec: {
      selector: { app: 'node-exporter' },
      ports: [{ port: 9100, targetPort: 9100 }]
    }
  };
  await coreV1Api.createNamespacedService({ namespace, body: nodeExporterService });

  // === Kube State Metrics ===
const kubeStateMetricsDeployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'kube-state-metrics', namespace },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'kube-state-metrics' } },
      template: {
        metadata: { labels: { app: 'kube-state-metrics' } },
        spec: {
          serviceAccountName: 'kube-state-metrics',
          containers: [
            {
              name: 'kube-state-metrics',
              image: 'quay.io/coreos/kube-state-metrics:latest',
              ports: [
                {
                  containerPort: 8080,
                  name: 'http-metrics', // обязательно ИМЯ
                  protocol: 'TCP'       // явно укажем протокол
                }
              ]
            }
          ],
          tolerations: [{
            key: 'node-role.kubernetes.io/control-plane',
            operator: 'Exists',
            effect: 'NoSchedule'
          }]
        }
      }
    }
  };
  await appsV1Api.createNamespacedDeployment({ namespace, body: kubeStateMetricsDeployment });

  const kubeStateMetricsService = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'kube-state-metrics', namespace },
    spec: {
      selector: { app: 'kube-state-metrics' },
      ports: [{ port: 8080, targetPort: 'http-metrics' }]
    }
  };
  await coreV1Api.createNamespacedService({ namespace, body: kubeStateMetricsService });

  // === Grafana ConfigMap ===
  const grafanaConfigMap = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: 'grafana-datasources',
      namespace,
      labels: { grafana_datasource: "1" }
    },
    data: {
      'prometheus.yaml': `
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus-service.monitoring.svc.cluster.local:9090
    isDefault: true
`
    }
  };
  await coreV1Api.createNamespacedConfigMap({ namespace, body: grafanaConfigMap });

  // === Grafana Deployment ===
  const grafanaDeployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'grafana', namespace },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'grafana' } },
      template: {
        metadata: { labels: { app: 'grafana' } },
        spec: {
          serviceAccountName: 'monitoring-sa',
          containers: [{
            name: 'grafana',
            image: 'grafana/grafana',
            ports: [{ containerPort: 3000 }],
            env: [
              { name: 'GF_PATHS_PROVISIONING', value: '/etc/grafana/provisioning' },
              { name: 'GF_SECURITY_ADMIN_USER', value: 'admin' },
              { name: 'GF_SECURITY_ADMIN_PASSWORD', value: 'admin' }
            ],
            volumeMounts: [
              {
                name: 'grafana-config',
                mountPath: '/etc/grafana/provisioning/datasources',
                readOnly: true
              },
              {
                name: 'grafana-storage',
                mountPath: '/var/lib/grafana'
              }
            ]
          }],
          volumes: [
            {
              name: 'grafana-config',
              configMap: { name: 'grafana-datasources' }
            },
            {
              name: 'grafana-storage',
              emptyDir: {}
            }
          ],
          tolerations: [{
            key: "node-role.kubernetes.io/control-plane",
            operator: "Exists",
            effect: "NoSchedule"
          }]
        }
      }
    }
  };
  await appsV1Api.createNamespacedDeployment({ namespace, body: grafanaDeployment });

  const grafanaService = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'grafana-service', namespace },
    spec: {
      selector: { app: 'grafana' },
      type: 'NodePort',
      ports: [{ port: 3000, targetPort: 3000, nodePort: 30030 }]
    }
  };
  await coreV1Api.createNamespacedService({ namespace, body: grafanaService });

  return {
    status: 'Monitoring stack deployed',
    grafanaURL: `http://${server.replace(/^https?:\/\//, '')}:30030`,
    prometheusURL: `http://${server.replace(/^https?:\/\//, '')}:30090`
  };
}

export async function deployHelloWorld(server: string, namespace = 'hello-world') {
  const { coreV1Api, appsV1Api } = await createK8sClient(server);

  await createNamespace(coreV1Api, namespace);

  const helloDeployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'hello-deployment', namespace },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: { app: 'hello' }
      },
      template: {
        metadata: {
          labels: { app: 'hello' },
          annotations: {
            "prometheus.io/scrape": "true",
            "prometheus.io/path": "/metrics",
            "prometheus.io/port": "9102"
          }
        },
        spec: {
          containers: [
            {
              name: 'metrics-exporter',
              image: 'prom/statsd-exporter', // ✅ экспортёр с /metrics
              ports: [{ containerPort: 9102 }],
              readinessProbe: {
                httpGet: {
                  path: '/metrics',
                  port: 9102
                },
                initialDelaySeconds: 5,
                periodSeconds: 10
              }
            }
          ],
          tolerations: [
            {
              key: "node-role.kubernetes.io/control-plane",
              operator: "Exists",
              effect: "NoSchedule"
            }
          ]
        }
      }
    }
  };

  await appsV1Api.createNamespacedDeployment({ namespace, body: helloDeployment });

  const helloService = {
    kind: 'Service',
    apiVersion: 'v1',
    metadata: {
      name: 'hello-service',
      namespace,
      annotations: {
        "prometheus.io/scrape": "true",
        "prometheus.io/path": "/metrics",
        "prometheus.io/port": "9102"
      }
    },
    spec: {
      type: 'NodePort',
      selector: { app: 'hello' },
      ports: [{
        port: 80,
        targetPort: 9102,
        nodePort: 30080
      }]
    }
  };

  await coreV1Api.createNamespacedService({ namespace, body: helloService });

  return {
    url: `http://${server.replace(/^https?:\/\//, '')}:30080/metrics`,
    status: 'Hello World deployed with working Prometheus metrics'
  };
}
export const getClustetById = async (id: number) => {
  return await prisma.cluster.findFirst({
    where: {
      id
    }
  })
}

export async function getNamespaces(server: string) {
  const { coreV1Api } = await createK8sClient(server);

  const nsResponse = await coreV1Api.listNamespace();
  const namespaces = nsResponse.items
    .map(ns => ns.metadata?.name)
    .filter((n): n is string => !!n);

  const result = await Promise.all(
    namespaces.map(async (ns) => {
      const podsResponse = await coreV1Api.listNamespacedPod({ namespace: ns });
      const pods = podsResponse.items;

      const podsCount = pods.length;
      const statusCounts = {
        Running: 0,
        Pending: 0,
        Failed: 0,
        Succeeded: 0,
        Unknown: 0,
      };

      const nodeSet = new Set<string>();

      pods.forEach(pod => {
        const phase = pod.status?.phase || 'Unknown';
        if (statusCounts[phase as keyof typeof statusCounts] !== undefined) {
          statusCounts[phase as keyof typeof statusCounts]++;
        } else {
          statusCounts.Unknown++;
        }
        if (pod.spec?.nodeName) {
          nodeSet.add(pod.spec.nodeName);
        }
      });

      return {
        name: ns,
        podsCount,
        nodesCount: nodeSet.size,
        statuses: statusCounts,
      };
    })
  );

  return result;
}


export async function createNamespaceCluster(server: string, namespace: string): Promise<boolean> {
  try {
    const { coreV1Api } = await createK8sClient(server);
  await coreV1Api.createNamespace({ body: { metadata: { name: namespace } } });

    return true;
  } catch (error) {
    console.error('Error creating namespace:', error);
    return false;
  }
}
export interface GptResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

export const askGpt = async (message: string): Promise<string> => {
  const prompt = `Ты - Senior DevOps Engineer с 10+ лет опыта. Анализируй проблемы строго по следующим критериям:

      1. Диагностика:
        - Какие метрики нужно проверить (CPU, Memory, Disk, Network)
        - Какие логи изучить в первую очередь
        - Как воспроизвести проблему

      2. Решение:
        - Конкретные команды для диагностики
        - Пошаговый план устранения
        - Рекомендации по мониторингу

      3. Профилактика:
        - Какие изменения внести в инфраструктуру
        - Какие алерты настроить
        - Как избежать повторения

      Формат ответа - только технические рекомендации без вводных фраз.
      Текст всегда на русском
      Проблема: {описание проблемы}
      Вопрос: ${message}`;

  try {
    const response = await axios.post(
      'http://46.173.27.40:11434/api/generate',
      {
        model: "tinyllama",
        prompt: prompt,
        stream: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 100000
      }
    );

    if (response.data?.response) {
      return response.data.response;
    }
    throw new Error('Invalid response format');
  } catch (error) {
    console.error('GPT request failed:', error);
    throw new Error(`Failed to get GPT response: ${error instanceof Error ? error.message : String(error)}`);
  }
};
export async function deleteNamespace(server: string, namespace: string): Promise<boolean> {
  try {
    const { coreV1Api } = await createK8sClient(server);
    await coreV1Api.deleteNamespace({ name: namespace });
    return true;
  } catch (error) {
    console.error('Error deleting namespace:', error);
    return false;
  }
}

// Получение списка неймспейсов
export async function getNamespacesDeployments(server: string): Promise<string[]> {
  const { coreV1Api } = await createK8sClient(server);
  const res = await coreV1Api.listNamespace();
  return res.items.map(ns => ns.metadata?.name || '').filter(Boolean);
}

// Получение списка деплоев по namespace
export async function getDeployments(server: string, namespace: string) {
  const { appsV1Api } = await createK8sClient(server);
  const res = await appsV1Api.listNamespacedDeployment({ namespace });
  return res.items.map(dep => ({
    name: dep.metadata?.name || '',
    replicas: dep.spec?.replicas || 0,
    availableReplicas: dep.status?.availableReplicas || 0
  }));
}

export async function scaleDeployment(
  server: string,
  namespace: string,
  deploymentName: string,
  replicas: number
): Promise<boolean> {
  try {
    const { appsV1Api } = await createK8sClient(server);
    const depRes = await appsV1Api.readNamespacedDeployment({ name: deploymentName, namespace });
    const dep = depRes;

    if (!dep.spec) throw new Error('Deployment spec not found');

    dep.spec.replicas = replicas;
    await appsV1Api.replaceNamespacedDeployment({ name: deploymentName, namespace, body: dep });

    return true;
  } catch (error) {
    console.error(`Error scaling deployment: ${error}`);
    return false;
  }
}

// === Примеры PromQL запросов ===
export const promQLQueries = {
  // CPU и память
  cpuUsage: `sum(rate(container_cpu_usage_seconds_total{container!="",pod!=""}[5m])) by (pod, namespace)`,
  memoryUsage: `sum(container_memory_usage_bytes{container!="",pod!=""}) by (pod, namespace)`,

  // Requests / Limits
  cpuRequests: `sum(kube_pod_container_resource_requests_cpu_cores) by (pod, namespace)`,
  memoryRequests: `sum(kube_pod_container_resource_requests_memory_bytes) by (pod, namespace)`,

  cpuLimits: `sum(kube_pod_container_resource_limits_cpu_cores) by (pod, namespace)`,
  memoryLimits: `sum(kube_pod_container_resource_limits_memory_bytes) by (pod, namespace)`
};
