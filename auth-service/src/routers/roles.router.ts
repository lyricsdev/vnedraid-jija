const router2 = require('express').Router()

const controller = require('../controllers/roles.controller')
const middlewareAuthForRoles = require('../middleware/auth.middleware')

router2.post('/reassign',middlewareAuthForRoles, controller.reassignRoles)
router2.post('/remove',middlewareAuthForRoles, controller.removeRoles)
router2.post('/permission',middlewareAuthForRoles, controller.postPermission)
router2.get('/permission',middlewareAuthForRoles, controller.getPermission)




module.exports = router2