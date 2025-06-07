#!/bin/bash
set -e

MASTER_IP=$(hostname -I | awk '{print $1}')
MASTER_PORT=6443
POD_CIDR="10.244.0.0/16"
LOG_FILE="/tmp/k8s-install.log"

log() {
  echo ">>> $*" >> "$LOG_FILE"
  "$@" >> "$LOG_FILE" 2>&1
}

### Установка зависимостей
log apt-get update -y
log apt-get install -y ca-certificates curl gnupg lsb-release software-properties-common

### Установка containerd
log apt-get install -y containerd
mkdir -p /etc/containerd
containerd config default > /etc/containerd/config.toml
sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
sed -i 's#sandbox_image = ".*"#sandbox_image = "registry.k8s.io/pause:3.9"#' /etc/containerd/config.toml
log systemctl restart containerd
log systemctl enable containerd

### Установка Kubernetes
mkdir -p /etc/apt/keyrings
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.28/deb/Release.key | gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.28/deb/ /" > /etc/apt/sources.list.d/kubernetes.list
log apt-get update -y
log apt-get install -y kubelet kubeadm kubectl
log apt-mark hold kubelet kubeadm kubectl

### Настройка UFW
log ufw allow OpenSSH
log ufw allow 6443/tcp
log ufw allow 2379:2380/tcp
log ufw allow 10250/tcp
log ufw allow 10251/tcp
log ufw allow 10252/tcp
log ufw --force enable

### Параметры ядра
log modprobe br_netfilter
echo '1' > /proc/sys/net/bridge/bridge-nf-call-iptables
echo '1' > /proc/sys/net/ipv4/ip_forward

### Предзагрузка образов
log kubeadm config images pull --image-repository=registry.k8s.io --kubernetes-version=1.28.0
log ctr image pull registry.k8s.io/pause:3.9

### Инициализация кластера
init_output=$(kubeadm init --pod-network-cidr=$POD_CIDR >> "$LOG_FILE" 2>&1)

### Настройка kubeconfig
mkdir -p $HOME/.kube
cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
chown $(id -u):$(id -g) $HOME/.kube/config

### Сетевой плагин
log kubectl apply -f https://raw.githubusercontent.com/coreos/flannel/master/Documentation/kube-flannel.yml

### Создание serviceaccount и прав
log kubectl create serviceaccount admin-api
log kubectl create clusterrolebinding admin-api-binding \
  --clusterrole=cluster-admin \
  --serviceaccount=default:admin-api

kubectl apply -f - >> "$LOG_FILE" 2>&1 <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: admin-api-token
  annotations:
    kubernetes.io/service-account.name: admin-api
type: kubernetes.io/service-account-token
EOF

sleep 5

### Получение токена и join-команды
api_token=$(kubectl get secret admin-api-token -o jsonpath="{.data.token}" | base64 -d)
api_user="admin-api"

join_command="kubeadm join $MASTER_IP:$MASTER_PORT --token $token --discovery-token-ca-cert-hash sha256:$ca_cert_hash"
token=$(kubeadm token list | awk 'NR==2 {print $1}')
ca_cert_hash=$(openssl x509 -pubkey -in /etc/kubernetes/pki/ca.crt \
  | openssl rsa -pubin -outform DER 2>/dev/null \
  | openssl dgst -sha256 -hex \
  | awk '{print $2}')

### Чистый JSON на stdout
cat <<EOF
{
  "status": "success",
  "ip": "$MASTER_IP",
  "port": "$MASTER_PORT",
  "join_command": "$join_command",
  "token": "$token",
  "ca_cert_hash": "$ca_cert_hash",
  "api_user": "$api_user",
  "api_token": "$api_token"
}
EOF
