const userRouter2 = require('express').Router()

const userController = require('../controllers/user.controller')

userRouter2.get('/:id', userController.getUsers)

module.exports = userRouter2