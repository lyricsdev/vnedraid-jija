import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

module.exports = function authMiddleware(
  req: Request, 
  res: Response, 
  next: NextFunction
) {
  try {
    const token = req.cookies.token;
    
    if (!token) {
      return res.status(401).json({
        code: 401,
        message: "Пользователь не авторизован"
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    console.log(decoded);
    if(!decoded){
        return res.status(401).json({
        code: 401,
        message: "Пользователь не авторизован"
      });
    }
    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({
      code: 401,
      message: "Недействительный токен"
    });
  }
};