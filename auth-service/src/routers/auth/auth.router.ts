const router = require('express').Router()

const cont = require('../../controllers/auth.controller')

router.post('/register', cont.postRegisterUser)
router.post('/login', cont.postLoginUser)
router.post('/verify', cont.verifyAccess)




module.exports = router