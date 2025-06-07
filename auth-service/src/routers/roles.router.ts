const routerRoles = require('express').Router()

const controller = require('../controllers/roles.controller')

routerRoles.post('/reassign', controller.reassignRoles)
routerRoles.post('/remove', controller.removeRoles)
routerRoles.post('/permission', controller.postPermission)
routerRoles.get('/permission', controller.getPermission)




module.exports = routerRoles