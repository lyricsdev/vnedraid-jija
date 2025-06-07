const userRouter = require('express').Router()

const userController = require('../controllers/user.controller')

userRouter.get('/:id', userController.getUsers)

module.exports = userRouter