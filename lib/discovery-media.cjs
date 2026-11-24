'use strict';
function qualifiesNativeImage(image) {
  let name;
  try { name = decodeURIComponent(new URL(image.url).pathname); } catch { return false; }
  if (/(?:^|\/)(?:thumbnail|placeholder)\.(?:png|webp|jpe?g)$/i.test(name)) return false;
  return image.loaded === true && /测速|speed|stair|clash|youtube/i.test((image.alt || '') + ' ' + name);
}
module.exports = { qualifiesNativeImage };
