import { Request, Response } from "express-serve-static-core";
import { ParsedQs } from "qs";
import { AuthDataset, AuthResponse } from "./types/auth.types";
import { Prisma } from '@prisma/client';

const prismaService = require('../database/prisma.service');
const passwordUtils = require('../utils/password.utils')
const utilsJwt = require('../utils/jwt.utils')

type getUserParams = {
    id:number
}

class UserController{

    async getUsers(req: Request<{}, any, any, ParsedQs, Record<string, any>>, res: Response<any, Record<string, any>, number>){
        const paramsUser = req.params as getUserParams
       
        const id = paramsUser.id
        

        if(!id) return res.status(404).send({
            code: 404,
            message: "Данные пользователя указаны неверно"
        })

        const users = await prismaService.$queryRaw`
        SELECT * FROM User where id = ${id}
        `

        return res.status(200).send({
            users: users
        })
    }

}

module.exports = new UserController()

