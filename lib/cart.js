const eventName = "cart-updated";
const keyFor = (token) => `cart:${token}`;

export function getCart(token) {
  if (typeof window === "undefined" || !token) return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(keyFor(token)) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveCart(token, cart) {
  if (typeof window === "undefined" || !token) return;
  try {
    window.localStorage.setItem(keyFor(token), JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent(eventName, { detail: { token } }));
  } catch {
    // Storage can be unavailable in private or restricted browsing modes.
  }
}

export function addToCart(token, item, qty = 1) {
  const cart = getCart(token);
  const existing = cart.find((line) => String(line.item_id) === String(item.id ?? item.item_id));
  const itemId = item.id ?? item.item_id;
  if (existing) {
    existing.quantity = Math.min(10, Math.max(1, existing.quantity + qty));
  } else {
    cart.push({ item_id: itemId, name: item.name, price: Number(item.price), quantity: Math.min(10, Math.max(1, qty)) });
  }
  saveCart(token, cart);
  return cart;
}

export function setQuantity(token, itemId, qty) {
  const cart = getCart(token).map((line) => String(line.item_id) === String(itemId)
    ? { ...line, quantity: Math.min(10, Math.max(1, Number(qty) || 1)) }
    : line);
  saveCart(token, cart);
  return cart;
}

export function removeFromCart(token, itemId) {
  const cart = getCart(token).filter((line) => String(line.item_id) !== String(itemId));
  saveCart(token, cart);
  return cart;
}

export function clearCart(token) {
  saveCart(token, []);
}

export function cartCount(cart) {
  return cart.reduce((total, line) => total + Number(line.quantity || 0), 0);
}

export function cartTotal(cart) {
  return cart.reduce((total, line) => total + Number(line.price || 0) * Number(line.quantity || 0), 0);
}
