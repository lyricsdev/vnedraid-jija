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
        console.log(req.cookies);
        const permissionIds: string[] = req.body.permissionIds;
        const userId = req.body.userId;

      
        await prismaService.$executeRaw`
            DELETE FROM UserPermission WHERE userId = ${userId}`
        
        console.log(permissionIds)
        console.log(userId)

        for(let i = 0; i < permissionIds.length; i++){
            await prismaService.$executeRaw`
            INSERT INTO UserPermission (id, userId, permissionId)
            VALUES (UUID(),${userId}, ${permissionIds[i]})`
        }

        return res.status(200).send({"ok":"ok"})
    }

    async removeRoles(req: Request<{}, any, any, ParsedQs, Record<string, any>>, res: Response<any, Record<string, any>, number>){
       const token = req.cookies.token;
      
        const userId = req.body.userId;
        await prismaService.$executeRaw`
            DELETE FROM UserPermission WHERE userId = ${userId}`

        return res.status(200).send({"ok":"ok"})
    }

    async postPermission(req: Request<{}, any, any, ParsedQs, Record<string, any>>, res: Response<any, Record<string, any>, number>){
        const token = req.cookies.token;
      
        
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
      

        const permissions = await prismaService.$queryRaw`
        SELECT * FROM Permission
        `
        return res.status(200).send({
            permissions: permissions
        })
    }

}

module.exports = new RolesController()

