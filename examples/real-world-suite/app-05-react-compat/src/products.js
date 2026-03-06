/**
 * Hardcoded product catalog.
 * Each product has an id, name, price (in cents), image emoji, and category.
 */
export const products = [
  { id: 'p1', name: 'Wireless Headphones', price: 7999, emoji: '\uD83C\uDFA7', category: 'electronics' },
  { id: 'p2', name: 'Running Shoes', price: 12999, emoji: '\uD83D\uDC5F', category: 'sports' },
  { id: 'p3', name: 'Coffee Maker', price: 4999, emoji: '\u2615', category: 'kitchen' },
  { id: 'p4', name: 'Backpack', price: 5999, emoji: '\uD83C\uDF92', category: 'accessories' },
  { id: 'p5', name: 'Desk Lamp', price: 3499, emoji: '\uD83D\uDCA1', category: 'electronics' },
  { id: 'p6', name: 'Yoga Mat', price: 2999, emoji: '\uD83E\uDDD8', category: 'sports' },
  { id: 'p7', name: 'Cast Iron Pan', price: 3999, emoji: '\uD83C\uDF73', category: 'kitchen' },
  { id: 'p8', name: 'Sunglasses', price: 8999, emoji: '\uD83D\uDD76\uFE0F', category: 'accessories' },
];

/**
 * Format a price in cents as a dollar string.
 * @param {number} cents
 * @returns {string}
 */
export function formatPrice(cents) {
  return '$' + (cents / 100).toFixed(2);
}
