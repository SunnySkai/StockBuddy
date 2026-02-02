import express from 'express'
import publicAuthRoute from './public'
// import privateAuthRoute from './private'

const route = express.Router()

route.use('/', publicAuthRoute)
// route.use('/admin', privateAuthRoute)

export = route
