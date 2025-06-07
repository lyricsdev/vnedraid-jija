import express from 'express';
import dotenv from 'dotenv';
dotenv.config();
const cors = require('cors')
const app = express();
const router = require('./routers/auth.router')
app.use(express.json());
app.use('/auth',router);
app.use(cors())

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
