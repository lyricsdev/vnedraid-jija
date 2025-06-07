const router2 = require('express').Router()

const controller = require('../controllers/roles.controller')
const middlewareAuthForRoles = require('../middleware/auth.middleware')

router2.post('/reassign', controller.reassignRoles)
router2.post('/remove', controller.removeRoles)
router2.post('/permission', controller.postPermission)
router2.get('/permission', controller.getPermission)




module.exports = router2