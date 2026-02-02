import express from 'express'
import publicUserRoute from './public'

const route = express.Router()

route.use('/', publicUserRoute)

export = route
