import express from 'express'
import publicOrganizationRoute from './public'

const route = express.Router()

route.use('/', publicOrganizationRoute)

export = route
