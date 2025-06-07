const userRouter = require('express').Router()

const userController = require('../controllers/user.controller')
const middlewareAuth = require('../middleware/auth.middleware')


userRouter.get('/:id', middlewareAuth, userController.getUsers)

module.exports = userRouter