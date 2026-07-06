export const CM_PER_INCH = 2.54;

/** @param {number} inches @returns {number} */
export const inToCm = (inches) => inches * CM_PER_INCH;

/** @param {number} cm @returns {number} */
export const cmToIn = (cm) => cm / CM_PER_INCH;
