/**
 * Zustand store for shopping cart state.
 *
 * This uses zustand's `create` which internally calls `useSyncExternalStore`
 * from React. The reactCompat vite plugin aliases that to what-react's
 * implementation, so it "just works" with What's reconciler.
 */
import { create } from 'zustand';

export const useCartStore = create((set, get) => ({
  /** @type {Record<string, { product: object, quantity: number }>} */
  items: {},

  /**
   * Add a product to the cart (or increment its quantity).
   * @param {object} product
   */
  addItem: (product) =>
    set((state) => {
      const existing = state.items[product.id];
      return {
        items: {
          ...state.items,
          [product.id]: {
            product,
            quantity: existing ? existing.quantity + 1 : 1,
          },
        },
      };
    }),

  /**
   * Remove one unit of a product (or remove entirely if quantity reaches 0).
   * @param {string} productId
   */
  removeItem: (productId) =>
    set((state) => {
      const existing = state.items[productId];
      if (!existing) return state;

      if (existing.quantity <= 1) {
        const { [productId]: _, ...rest } = state.items;
        return { items: rest };
      }

      return {
        items: {
          ...state.items,
          [productId]: {
            ...existing,
            quantity: existing.quantity - 1,
          },
        },
      };
    }),

  /**
   * Remove a product from the cart entirely regardless of quantity.
   * @param {string} productId
   */
  removeAll: (productId) =>
    set((state) => {
      const { [productId]: _, ...rest } = state.items;
      return { items: rest };
    }),

  /**
   * Clear the entire cart.
   */
  clearCart: () => set({ items: {} }),

  /**
   * Derived: total number of items in the cart.
   * @returns {number}
   */
  getItemCount: () => {
    const { items } = get();
    return Object.values(items).reduce((sum, entry) => sum + entry.quantity, 0);
  },

  /**
   * Derived: total price in cents.
   * @returns {number}
   */
  getTotal: () => {
    const { items } = get();
    return Object.values(items).reduce(
      (sum, entry) => sum + entry.product.price * entry.quantity,
      0
    );
  },
}));
