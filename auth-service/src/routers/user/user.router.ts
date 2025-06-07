const userRouter2 = require('express').Router()

const userController = require('../../controllers/user.controller')

userRouter2.get('/:id', userController.getUsers)

const controller2 = require('../../controllers/roles.controller')

userRouter2.post('/reassign', controller2.reassignRoles)
userRouter2.post('/remove', controller2.removeRoles)
userRouter2.post('/permission', controller2.postPermission)
userRouter2.get('/permission', controller2.getPermission)

module.exports = userRouter2