const router2 = require('express').Router()

const controller = require('../controllers/roles.controller')

router2.post('/roles/reassign', controller.reassignRoles)
router2.post('/roles/remove', controller.removeRoles)
router2.post('/roles/permission', controller.postPermission)
router2.get('/roles/permission', controller.getPermission)




module.exports = router2