import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Uploads an in-memory file buffer (from multer's memoryStorage) straight to
 * Cloudinary, so nothing ever touches local disk - important on Render and
 * similar platforms where the filesystem is ephemeral and wiped on every deploy.
 *
 * KYC documents are sensitive: they're uploaded with `type: "authenticated"` so
 * the resulting URL isn't publicly viewable by default. If you build an admin
 * screen to review documents, generate a short-lived signed URL for it with
 * `cloudinary.utils.private_download_url()` rather than storing/serving the raw URL.
 */
export function uploadKycDocument(buffer, { folder = "legion/kyc", publicId } = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "auto",
        type: "authenticated",
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

export default cloudinary;
