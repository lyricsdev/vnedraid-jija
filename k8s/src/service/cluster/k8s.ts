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
    // Просто пропускаем, если namespace уже существует
    if (e?.response?.body?.reason !== 'AlreadyExists') {
      throw e;
    }
  }
}

export async function deployPrometheus(server: string, namespace = 'monitoring') {
    const { coreV1Api, appsV1Api } = await createK8sClient(server);

    // 1. Создаём namespace
    await createNamespace(coreV1Api, namespace);

    // 2. ConfigMap с расширенным prometheus.yml
    const prometheusConfig = {
        kind: 'ConfigMap',
        apiVersion: 'v1',
        metadata: { name: 'prometheus-config', namespace },
        data: {
            'prometheus.yml': `
global:
  scrape_interval: 15s

scrape_configs:
  # Собираем метрики самого Prometheus
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Собираем метрики с kubelet (через API proxy)
  - job_name: 'kubelet'
    kubernetes_sd_configs:
      - role: node
    scheme: https
    tls_config:
      insecure_skip_verify: true
    bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
    relabel_configs:
      - action: labelmap
        regex: __meta_kubernetes_node_label_(.+)
      - target_label: __address__
        replacement: kubernetes.default.svc:443
      - source_labels: [__meta_kubernetes_node_name]
        regex: (.+)
        target_label: __metrics_path__
        replacement: /api/v1/nodes/$1/proxy/metrics

  # Все поды с аннотациями
  - job_name: 'pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        regex: (.+):(?:\\d+);(\\d+)
        replacement: $1:$2
        target_label: __address__

  # Все сервисы с аннотациями
  - job_name: 'services'
    kubernetes_sd_configs:
      - role: service
    relabel_configs:
      - source_labels: [__meta_kubernetes_service_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_service_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      - source_labels: [__address__, __meta_kubernetes_service_annotation_prometheus_io_port]
        action: replace
        regex: (.+):(?:\\d+);(\\d+)
        replacement: $1:$2
        target_label: __address__
`
        }
    };

    await coreV1Api.createNamespacedConfigMap({
        namespace,
        body: prometheusConfig
    });

    // 3. Deployment Prometheus
    const prometheusDeployment = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'prometheus', namespace },
        spec: {
            replicas: 1,
            selector: {
                matchLabels: { app: 'prometheus' }
            },
            template: {
                metadata: {
                    labels: { app: 'prometheus' }
                },
                spec: {
                    containers: [
                        {
                            name: 'prometheus',
                            image: 'prom/prometheus:latest',
                            args: [
                                '--config.file=/etc/prometheus/prometheus.yml',
                                '--storage.tsdb.path=/prometheus'
                            ],
                            ports: [{ containerPort: 9090 }],
                            volumeMounts: [{
                                name: 'prometheus-config-volume',
                                mountPath: '/etc/prometheus'
                            }]
                        }
                    ],
                    volumes: [{
                        name: 'prometheus-config-volume',
                        configMap: { name: 'prometheus-config' }
                    }],
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

    await appsV1Api.createNamespacedDeployment({
        namespace,
        body: prometheusDeployment
    });

    // 4. Service Prometheus (NodePort — для внешнего доступа)
    const prometheusService = {
        kind: 'Service',
        apiVersion: 'v1',
        metadata: { name: 'prometheus-service', namespace },
        spec: {
            type: 'NodePort',
            selector: { app: 'prometheus' },
            ports: [{
                port: 9090,
                targetPort: 9090,
                nodePort: 30090
            }]
        }
    };

    await coreV1Api.createNamespacedService({
        namespace,
        body: prometheusService
    });

    return {
        url: `http://${server.replace(/^https?:\/\//, '')}:30090`,
        status: 'Deployed'
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

