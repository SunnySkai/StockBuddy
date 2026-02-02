import express, { Request, Response } from 'express'
import { getPresignedUrl } from '../../aws_integration/s3/get'

const route = express.Router()

route.post('/get_presigned_url', async (req: Request, res: Response) => {
  const { file_key: fileKey, content_type: contentType } = req.body

  if (!fileKey || !contentType) {
    res.status(400).json({ success: false, message: 'File key and content type are required' })
    return
  }

  const url = await getPresignedUrl(fileKey, contentType)
  res.json({ success: true, url })
})

export = route
