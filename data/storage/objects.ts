import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { config } from '../../gateway/config.js';
const s3 = config.S3_ENDPOINT ? new S3Client({
  endpoint: config.S3_ENDPOINT, region: 'us-east-1', forcePathStyle: true,
  credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY }
}) : undefined;
export async function initObjects() {
  if (!s3) return;
  try { await s3.send(new HeadBucketCommand({ Bucket: config.S3_BUCKET })); }
  catch (err: any) {
    if (err.$metadata?.httpStatusCode !== 404) throw err;
    await s3.send(new CreateBucketCommand({ Bucket: config.S3_BUCKET }));
  }
}
export async function saveObject(id: string, content: Buffer) {
  if (s3) await s3.send(new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: id, Body: content }));
  else { await mkdir(join(config.DATA_DIR, 'objects'), { recursive: true }); await writeFile(join(config.DATA_DIR, 'objects', id), content, { flag: 'wx' }); }
  return id;
}
export async function loadObject(id: string): Promise<Buffer> {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Identificador de objeto inválido.');
  if (!s3) return readFile(join(config.DATA_DIR, 'objects', id));
  const result = await s3.send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: id }));
  if (!result.Body) throw new Error('Arquivo original indisponível.');
  return Buffer.from(await result.Body.transformToByteArray());
}
export async function deleteObject(id: string) {
  if (s3) await s3.send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: id }));
  else await unlink(join(config.DATA_DIR, 'objects', id)).catch((err) => { if (err.code !== 'ENOENT') throw err; });
}
