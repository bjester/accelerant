import {
  deleteObject,
  getBytes,
  getDownloadURL,
  getMetadata,
  ref as storageRef,
  uploadBytes,
  uploadBytesResumable,
} from 'firebase/storage';
import { BadRequestError, NotFoundError } from '../../errors.js';
import { shouldStreamUpload } from '../../util.js';
import StrategyHandler from './index.js';

const DL_STREAM_THRESHOLD = 15 * 1024 * 1024; // 15 MB

class StorageStrategyHandler extends StrategyHandler {
  get storage() {
    return this.runtime.firebase.storage;
  }

  _getStoragePath(request) {
    const context = this._getContext(request);
    const storagePath = context.getStoragePath().replace(/^\/+/, '');

    if (!storagePath) {
      throw new BadRequestError('storage path required');
    }
    return storagePath;
  }
}

/**
 * Handler for GET requests - download files
 */
export class GetStrategyHandler extends StorageStrategyHandler {
  /**
   * @param {Request} request
   * @return {Promise<Response>}
   * @protected
   */
  async _doFetch(request) {
    const storagePath = this._getStoragePath(request);
    const fileRef = storageRef(this.storage, storagePath);

    // Fetch metadata and file data
    let metadata;
    try {
      metadata = await getMetadata(fileRef);
    } catch (error) {
      if (error.code === 'storage/object-not-found') {
        throw new NotFoundError('file not found');
      }
      throw error;
    }

    const headers = new Headers();
    if (metadata.size) {
      headers.set('Content-Length', String(metadata.size));
    }
    if (metadata.updated) {
      headers.set('Last-Modified', new Date(metadata.updated).toUTCString());
    }
    if (metadata.etag) {
      headers.set('ETag', metadata.etag);
    }

    const context = this._getContext(request);
    let body;

    // If it's a large file, just stream it back
    if (context.params.get('stream') || metadata.size > DL_STREAM_THRESHOLD) {
      headers.set('Content-Type', 'application/octet-stream');
      const downloadUrl = await getDownloadURL(fileRef);
      const fResponse = await fetch(downloadUrl);
      body = fResponse.body;
    } else {
      body = await getBytes(fileRef);
      if (metadata.contentType) {
        headers.set('Content-Type', metadata.contentType);
      } else {
        headers.set('Content-Type', 'application/octet-stream');
      }
    }

    return this.runtime.response.plain.ok(body, { status: 200, headers });
  }
}

/**
 * Handler for HEAD requests - check file existence
 */
export class HeadStrategyHandler extends StorageStrategyHandler {
  /**
   * @param {Request} request
   * @return {Promise<Response>}
   * @protected
   */
  async _doFetch(request) {
    const storagePath = this._getStoragePath(request);
    const fileRef = storageRef(this.storage, storagePath);

    try {
      const metadata = await getMetadata(fileRef);
      const downloadUrl = await getDownloadURL(fileRef);

      const headers = new Headers();
      headers.set('X-Download-URL', downloadUrl);
      if (metadata.contentType) {
        headers.set('Content-Type', metadata.contentType);
      } else {
        headers.set('Content-Type', 'application/octet-stream');
      }
      if (metadata.size) {
        headers.set('Content-Length', String(metadata.size));
      }
      if (metadata.updated) {
        headers.set('Last-Modified', new Date(metadata.updated).toUTCString());
      }
      if (metadata.etag) {
        headers.set('ETag', metadata.etag);
      }
      if (metadata.md5Hash) {
        headers.set('X-Content-MD5', metadata.md5Hash);
        if (!metadata.etag) {
          headers.set('ETag', metadata.md5Hash.replace('"', ''));
        }
      }
      if (metadata.timeCreated) {
        headers.set('X-Time-Created', metadata.timeCreated);
      }
      return this.runtime.response.json.noContent({ headers });
    } catch (error) {
      if (error.code === 'storage/object-not-found') {
        throw new NotFoundError('file not found');
      }
      throw error;
    }
  }
}

/**
 * Handler for PUT requests - upload files
 */
export class PutStrategyHandler extends StorageStrategyHandler {
  /**
   * @param {Request} request
   * @return {Promise<Response>}
   * @protected
   */
  async _doFetch(request) {
    const storagePath = this._getStoragePath(request.clone());
    const fileRef = storageRef(this.storage, storagePath);

    const fileData = await request.clone().blob();
    const contentType = request.headers.get('Content-Type') || 'application/octet-stream';

    // Upload the file
    const shouldStream = shouldStreamUpload(
      this.runtime.config.useEmulators ? 'http' : self.location.origin,
      fileData,
    );

    let uploadResult;

    if (shouldStream) {
      uploadResult = await new Promise((resolve, reject) => {
        const uploadTask = uploadBytesResumable(fileRef, fileData, { contentType });

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log(`Upload is ${progress}% done`);
            switch (snapshot.state) {
              case 'paused':
                console.log('Upload is paused');
                break;
              case 'running':
                console.log('Upload is running');
                break;
            }
          },
          (err) => {
            console.error(err);
            console.log({ ...err });
            reject(err);
          },
          () => {
            resolve(uploadTask.snapshot);
          },
        );
      });
    } else {
      uploadResult = await uploadBytes(fileRef, fileData, { contentType });
    }

    // Get download URL
    const downloadUrl = await getDownloadURL(fileRef);

    return this.runtime.response.json.created({
      url: downloadUrl,
      path: storagePath,
      metadata: {
        size: uploadResult.metadata.size,
        contentType: uploadResult.metadata.contentType,
        timeCreated: uploadResult.metadata.timeCreated,
        updated: uploadResult.metadata.updated,
      },
    });
  }
}

/**
 * Handler for DELETE requests - delete files
 */
export class DeleteStrategyHandler extends StorageStrategyHandler {
  /**
   * @param {Request} request
   * @return {Promise<Response>}
   * @protected
   */
  async _doFetch(request) {
    const storagePath = this._getStoragePath(request);
    const fileRef = storageRef(this.storage, storagePath);

    // Check if file exists first
    try {
      await getMetadata(fileRef);
    } catch (error) {
      if (error.code === 'storage/object-not-found') {
        throw new NotFoundError('file not found');
      }
      throw error;
    }

    // Delete the file
    await deleteObject(fileRef);

    return this.runtime.response.json.noContent();
  }
}
