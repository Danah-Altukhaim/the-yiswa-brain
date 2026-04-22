import {
  S3Client,
  type S3ClientConfig,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { withRetry } from "../lib/retry.js";

const R2_REQUEST_TIMEOUT_MS = 30_000;
const R2_CONNECTION_TIMEOUT_MS = 5_000;

const endpoint = process.env.R2_ACCOUNT_ID
  ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : undefined;

const r2Config: S3ClientConfig = {
  region: "auto",
  requestHandler: {
    requestTimeout: R2_REQUEST_TIMEOUT_MS,
    connectionTimeout: R2_CONNECTION_TIMEOUT_MS,
  },
  maxAttempts: 1,
};
if (endpoint) r2Config.endpoint = endpoint;
if (process.env.R2_ACCESS_KEY_ID) {
  r2Config.credentials = {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  };
}
export const r2 = new S3Client(r2Config);

const bucket = process.env.R2_BUCKET ?? "brain-media";

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
  signal?: AbortSignal,
) {
  try {
    await withRetry(() =>
      r2.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
        { abortSignal: signal },
      ),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown upload error";
    throw new Error(`R2 upload failed for key ${key}: ${message}`);
  }
}

export async function presignedGet(key: string, expiresIn = 3600) {
  return getSignedUrl(r2, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
}

export { bucket as R2_BUCKET };
