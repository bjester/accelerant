const isObject = (value) => Object.prototype.toString.call(value) === '[object Object]';

/**
 * Deep merge utility function
 * @param {Object} target - The target object to merge into
 * @param {Object} source - The source object to merge from
 * @return {Object} A new object containing the merged result
 */
export function merge(target, source) {
  const output = { ...target };

  for (const key in source) {
    if (Object.hasOwn(source, key)) {
      if (isObject(source[key]) && isObject(target[key])) {
        // Deep merge for plain objects
        output[key] = merge(target[key], source[key]);
      } else {
        // Overwrite with source value for arrays and primitives
        output[key] = source[key];
      }
    }
  }

  return output;
}
