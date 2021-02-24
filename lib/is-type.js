/**
 * A simple type checker. Pass it an object and a type and see if they match!
 *
 * @param {*} thingToMatch   The thing to type-check.
 * @param {*} type   The type to match against. Usually begins with a capital letter.
 */
export function isType(thingToMatch, type) {
  let isTypeExactly = thingToMatch === type;
  let bothAreNaN = Number.isNaN(thingToMatch) && Number.isNaN(type);

  if (isTypeExactly || bothAreNaN) {
    return true;
  }

  // react type-check (only react14+)
  try {
    if (thingToMatch.$$typeof === Symbol.for("react.element"))
      return thingToMatch.type === type;

    return Object.getPrototypeOf(thingToMatch) === type.prototype;
  } catch (error) {
    if (!isType(error, TypeError)) {
      console.warn(error);
    }
    return false;
  }
}