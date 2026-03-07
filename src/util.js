/**
 * @param {string} url
 * @param {File|Blob|ArrayBuffer|BufferSource} body
 * @return {boolean}
 */
export function shouldStreamUpload(url, body) {
  // 256 * 1024 comes from Firebase, duplex stream requires https
  return body instanceof Blob && body.size >= 256 * 1024 && /^https/.test(url);
}