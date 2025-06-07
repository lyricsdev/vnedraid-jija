import jwt, { SignOptions }  from 'jsonwebtoken';
import { config } from 'dotenv';
config(); // Загружаем переменные окружения из .env

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

/**
 * Генерация JWT токена
 * @param payload - Данные для записи в токен (обычно userId)
 * @returns JWT токен
 */

class jwtUtils{

    generateToken(payload: object): string {
        const options: SignOptions = { 
            expiresIn: EXPIRES_IN as any
        };
        return jwt.sign(payload, JWT_SECRET, options);
    };
    
    /**
     * Проверка JWT токена
     * @param token - Токен для проверки
     * @returns Раскодированные данные или null если невалидный
    */
   verifyToken(token: string): any {
       try {
           return jwt.verify(token, JWT_SECRET);
        } catch (e) {
            return null;
        }
    };
}

module.exports = new jwtUtils();
    