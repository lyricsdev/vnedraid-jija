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
        try{

            await prismaService.$executeRaw`
            INSERT INTO User (name, password, createdAt)
            VALUES (
                ${name},
                ${await passwordUtils.encryptPassword(password)},
                NOW()
                )
                `;
        }catch(e){
            return res.status(404).send({
            code: 404,
            message: "Данный пользователь существует"
            })
        }

           
        const [user] = await prismaService.$queryRaw<{id: number}[]>`
            SELECT id FROM User WHERE name = ${name} LIMIT 1
        `;
        
        const users = await prismaService.$queryRaw`
        SELECT 
            *
        FROM User where name = ${name}
        `;

        if(!users[0]) return res.status(404).send({
            code: 404,
            message: "Ошибка авторизации"
        })
            
        const returnObject: AuthDataset = {
            id: users[0].id,
            name: users[0].name,
            createdAt: users[0].createdAt
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
        if(!user[0]) return res.status(404).send({
            code: 404,
            "message":"Данного пользователя не существует"
        })
        const varify = await passwordUtils.verifyPassword(password, user[0].password)

        if(!varify) return res.status(402).send({
            code: 402,
            message: "Указанные данные пользователя неверны"
        })

        if(!user[0]) return res.status(404).send({
            code: 404,
            message: "Ошибка авторизации"
        })
            
        const userPerm = await prismaService.$queryRaw`
        SELECT 
            *
        FROM UserPermission where userId = ${user[0].id}
        `;
        let roles = [];
        for(let i = 0; i < userPerm.length; i++){
            roles.push(...await prismaService.$queryRaw`
                SELECT 
                    *
                FROM Permission where id = ${userPerm[i].permissionId}
            `)
        }

        
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

    async verifyAccess(req: Request<{}, any, any, ParsedQs, Record<string, any>>, res: Response<any, Record<string, any>, number>){
        const token = req.cookies?.token;
        if(!token) res.status(401).json({"verify": false});
        const isVerified = utilsJwt.verifyToken(token)
        if(isVerified) return res.json({"verify": true});
        return res.json({"verify": false});
    }
}

module.exports = new AuthController()

