import { Request, Response } from "express-serve-static-core";
import { ParsedQs } from "qs";
import { AuthDataset, AuthResponse } from "./types/auth.types";
import { Prisma } from '@prisma/client';

const prismaService = require('../database/prisma.service');
const passwordUtils = require('../utils/password.utils')
const utilsJwt = require('../utils/jwt.utils')

class RolesController{

    async reassignRoles(req: Request<{}, any, any, ParsedQs, Record<string, any>>, res: Response<any, Record<string, any>, number>){
        const token = req.cookies.token;

        const {roleId, permissionIds} = req.body;
        if(!token) return res.status(401).send({
            code: 401,
            message: "Пользователь не авторизован"
        })
        const role = await prismaService.$executeRaw`
            DELTE FROM "RolePermission" WHERE id = ${roleId}`

        for(let i = 0; i < permissionIds.length; i++){
            await prismaService.$executeRaw`
            INSERT INTO RolePermission (id, name)
            VALUES (UUID(), ${name})`

        }

        console.log(await prismaService.$queryRaw`SELect * from RolePermission`)


        return res.status(200)
    }

    async removeRoles(req: Request<{}, any, any, ParsedQs, Record<string, any>>, res: Response<any, Record<string, any>, number>){
       const token = req.cookies.token;
        if(!token) return res.status(401).send({
            code: 401,
            message: "Пользователь не авторизован"
        })

        return res.status(200).send()
    }

    async postPermission(req: Request<{}, any, any, ParsedQs, Record<string, any>>, res: Response<any, Record<string, any>, number>){
        const token = req.cookies.token;
        if(!token) return res.status(401).send({
            code: 401,
            message: "Пользователь не авторизован"
        })
        
        const name = req.body.name 

        const result = await prismaService.$executeRaw`
         INSERT INTO Permission (id, name)
            VALUES (UUID(), ${name})
        `

        console.log(result)
        return res.status(200).send({"ok":"ok"})
    }



    async getPermission(req: Request<{}, any, any, ParsedQs, Record<string, any>>, res: Response<any, Record<string, any>, number>){
        const token = req.cookies.token;
        if(!token) return res.status(401).send({
            code: 401,
            message: "Пользователь не авторизован"
        })

        const permissions = await prismaService.$queryRaw`
        SELECT * FROM Permission
        `
        return res.status(200).send({
            permissions: permissions
        })
    }

}

module.exports = new RolesController()

