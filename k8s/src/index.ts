import express from 'express';
import dotenv from 'dotenv';
import k8sRouter from './controllers/k8s'
import projectRouter from './controllers/project'
import { getClusterInfo } from './service/cluster/k8s';
import cors from 'cors'
dotenv.config();

const app = express();
app.use(cors({
  origin: "*"
}))
app.use(express.json());
app.use('/api/k8s/cluster', k8sRouter)
app.use('/api/k8s/project', projectRouter)


const PORT = process.env.PORT || 3001;
app.listen(PORT, async() => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(await getClusterInfo("https://31.207.76.43:6443"))
});
