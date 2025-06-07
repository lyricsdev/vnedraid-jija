import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';

dotenv.config();
const cors = require('cors')
const app = express();
const router = require('./routers/auth.router')
const router2 = require('./routers/roles.router')

app.use(cookieParser());
app.use(express.json());
app.use('/api/auth',router);
app.use('/api/roles',router2);

app.use(cors({
  origin: "*"
}))
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
