const router = require('express').Router()

const cont = require('../controllers/auth.controller')

router.post('/auth/register', cont.postRegisterUser)
router.post('/auth/login', cont.postLoginUser)


module.exports = router