import { NodeSSH } from 'node-ssh';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';

const ssh = new NodeSSH();

const KEY_DIR = path.resolve(__dirname, '../../ssh_keys');
const PRIVATE_KEY_PATH = path.join(KEY_DIR, 'id_rsa');
const PUBLIC_KEY_PATH = path.join(KEY_DIR, 'id_rsa.pub');

export async function ensureSSHKeyPair(): Promise<void> {
  if (!fs.existsSync(PRIVATE_KEY_PATH) || !fs.existsSync(PUBLIC_KEY_PATH)) {
    console.log('🔐 Генерация SSH-ключа...');
    await fs.ensureDir(KEY_DIR);
    execSync(`ssh-keygen -t rsa -b 2048 -f ${PRIVATE_KEY_PATH} -q -N ""`);
  }
}

export async function setupSSHAccessWithPassword(host: string, username: string, password: string) {
  await ensureSSHKeyPair();

  console.log('🔌 Подключение по паролю...');
  await ssh.connect({
    host,
    username,
    password,
  });

  const pubKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf-8');

  console.log('📤 Копирование публичного ключа на сервер...');
  await ssh.execCommand(`mkdir -p ~/.ssh && echo "${pubKey}" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`);
  ssh.dispose();

  console.log('✅ Ключ установлен. Теперь можно использовать авторизацию по ключу.');
}
