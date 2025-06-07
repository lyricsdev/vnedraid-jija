import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';

dotenv.config();
const cors = require('cors')
const app = express();
const router = require('./routers/auth.router')
const router2 = require('./routers/roles.router')
const userRouter = require('./routers/user.router')


app.use(cors({
  origin: 'http://localhost:3000', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

app.use(cookieParser());
app.use(express.json());
const middlewareAuth = require('./middleware/auth.middleware')
app.use('/api/roles/roles',middlewareAuth, router2);
app.use('/api/users/users',middlewareAuth, userRouter);
app.use('/api/auth', router);




const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
