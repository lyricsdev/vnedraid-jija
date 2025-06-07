import { Request, Response } from "express-serve-static-core";
import { ParsedQs } from "qs";
import { AuthDataset, AuthResponse } from "./types/auth.types";
import { Prisma } from '@prisma/client';

const prismaService = require('../database/prisma.service');
const passwordUtils = require('../utils/password.utils')
const utilsJwt = require('../utils/jwt.utils')

class AuthController{

    async postRegisterUser(req: Request<{}, any, any, ParsedQs, Record<string, any>>, res: Response<any, Record<string, any>, number>){
    
        const {name, password} = req.body;
        const result =  await prismaService.$executeRaw`
        INSERT INTO User (name, password, createdAt)
        VALUES (
        ${name},
        ${await passwordUtils.encryptPassword(password)},
        NOW()
        )
        `;
    
        const [user] = await prismaService.$queryRaw<{id: number}[]>`
            SELECT id FROM User WHERE name = ${name} LIMIT 1
        `;
        
        const [role] = await prismaService.$queryRaw<{id: string}[]>`
            SELECT id FROM Role WHERE name = 'user' LIMIT 1
        `;
        
        await prismaService.$executeRaw`
            INSERT INTO UserRole (userId, roleId)
            VALUES (${user.id}, ${role.id})
        `;



        const users = await prismaService.$queryRaw`
        SELECT 
            *
        FROM User where name = ${name}
        `;

       

        const rolesUsers = await prismaService.$queryRaw`
        SELECT 
            roleId
        FROM UserRole where userId = ${users[0].id}        `;

        const rolesIds = rolesUsers.map((role: any)=>{
            return role.roleId
        })

        const roles = await prismaService.$queryRaw`
            SELECT 
                *
            FROM Role where id in (${rolesIds.join(',')}) `;

            
        const returnObject: AuthDataset = {
            id: users[0].id,
            name: users[0].name,
            createdAt: users[0].createdAt,
            roles
        } 
        const res2 = utilsJwt.generateToken(returnObject)

        res.cookie('token', res2, {
            httpOnly: true, 
            secure: true, 
            sameSite: 'strict', 
            maxAge: 24 * 60 * 60 * 1000,
        });

        return res.status(200).send(returnObject)
    }

    async postLoginUser(req: Request<{}, any, any, ParsedQs, Record<string, any>>, res: Response<any, Record<string, any>, number>){
        const {name, password} = req.body;
         const user = await prismaService.$queryRaw`
            SELECT * FROM User WHERE name = ${name} LIMIT 1
        `;

        const rolesUsers = await prismaService.$queryRaw`
        SELECT 
            roleId
        FROM UserRole where userId = ${user[0].id}        `;

        const rolesIds = rolesUsers.map((role: any)=>{
            return role.roleId
        })

        const roles = await prismaService.$queryRaw`
            SELECT 
                *
            FROM Role where id in (${rolesIds.join(',')}) `;

        const varify = await passwordUtils.verifyPassword(password, user[0].password)

        if(!varify) return res.status(402).send({
            code: 402,
            message: "Указанные данные пользователя неверны"
        })
        
        const returnObject: AuthDataset = {
            id: user[0].id,
            name: user[0].name,
            createdAt: user[0].createdAt,
            roles
        } 
        const res2 = utilsJwt.generateToken(returnObject)

        res.cookie('token', res2, {
            httpOnly: true, 
            secure: true, 
            sameSite: 'strict', 
            maxAge: 24 * 60 * 60 * 1000,
        });

        
        return res.status(200).send(returnObject)
    }
}

module.exports = new AuthController()

