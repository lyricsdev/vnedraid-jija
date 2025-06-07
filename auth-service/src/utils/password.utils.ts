import { hash, compare, genSalt } from 'bcrypt';


/**
 * Хеширование пароля (encrypt)
 * @param plainPassword - Пароль в чистом виде
 * @returns Хешированный пароль
*/
const SALT_ROUNDS = 12; // Количество раундов хеширования (рекомендуется 10-12)

class passwordUtil {

    async encryptPassword(plainPassword: string): Promise<string> {
        const salt = await genSalt(SALT_ROUNDS);
        return await hash(plainPassword, salt);
    }
    
    /**
     * Проверка пароля (decrypt/verify)
     * @param plainPassword - Пароль в чистом виде для проверки
     * @param hashedPassword - Хешированный пароль из базы данных
     * @returns true если пароли совпадают, false если нет
    */
   async verifyPassword(
       plainPassword: string,
       hashedPassword: string
    ): Promise<boolean> {
        return await compare(plainPassword, hashedPassword);
    }
}

module.exports = new passwordUtil()