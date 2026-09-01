import { useEffect, useState, useCallback } from "react";
import PropTypes from "prop-types";
import {
  Outlet,
  useLoaderData,
  useNavigation,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

// ✅ FIXED: Proper server-side loader
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(`#graphql
    query ShopSessionInfo {
      shop {
        myshopifyDomain
      }
    }`);
  const responseJson = await response.json();

  if (responseJson.errors?.length) {
    throw new Error(
      responseJson.errors.map(({ message }) => message).join(", "),
    );
  }

  // ✅ FIXED: Use process.env instead of window
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shopDomain: responseJson.data?.shop?.myshopifyDomain || "",
  };
};

function CartDrawer({ isOpen, onClose, shopDomain, onCartDataChange }) {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(false);

  // ✅ FIXED: Use useCallback to avoid recreating function on every render
  const loadCart = useCallback(async () => {
    if (!shopDomain) {
      onCartDataChange?.(null);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch("/apps/cart-crest/cart/cart", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Unable to load cart");
      const cartData = await response.json();
      setCart(cartData);
      onCartDataChange?.(cartData);
    } catch (error) {
      console.error("Cart load error:", error);
      setCart(null);
      onCartDataChange?.(null);
    } finally {
      setLoading(false);
    }
  }, [shopDomain, onCartDataChange]);

  const updateQuantity = async (line, quantity) => {
    if (!shopDomain) return;

    try {
      const response = await fetch("/apps/cart-crest/cart/change", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          line: String(line),
          quantity: String(quantity),
        }),
      });

      if (!response.ok) throw new Error("Unable to update cart");
      document.dispatchEvent(new CustomEvent("cart:refresh"));
      await loadCart();
    } catch (error) {
      console.error("Update cart error:", error);
    }
  };

  const removeItem = async (line) => {
    await updateQuantity(line, 0);
  };

  // ✅ FIXED: Proper dependency array (no loadCart dependency)
  useEffect(() => {
    loadCart();

    const handleCartRefresh = () => {
      loadCart();
    };

    document.addEventListener("cart:refresh", handleCartRefresh);

    return () => {
      document.removeEventListener("cart:refresh", handleCartRefresh);
    };
  }, [shopDomain, loadCart]);

  if (!isOpen) return null;

  const cartItems = cart?.items ?? [];
  const subtotal = cart?.total_price
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: cart.currency || "USD",
      }).format(cart.total_price / 100)
    : "$0.00";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#18221d]/40">
      <div className="flex h-full w-full max-w-md flex-col border-l border-[#dce5df] bg-[#f6f7f5] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#dce5df] bg-white px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#3c8060]">
              Shopping cart
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[#18221d]">
              Your cart
            </h2>
          </div>
          <button
            aria-label="Close cart"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#edf3ee] text-xl text-[#53645b] hover:bg-[#e1eadf]"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex min-h-[180px] items-center justify-center text-sm text-[#53645b]">
              Loading your cart...
            </div>
          ) : cartItems.length === 0 ? (
            <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#cbd8cf] bg-white p-6 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#eaf4ee] text-2xl text-[#2f8c59]">
                🛒
              </div>
              <p className="text-lg font-semibold text-[#18221d]">
                Your cart is empty
              </p>
              <p className="mt-2 text-sm text-[#718078]">
                Add a product to see it here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {cartItems.map((item) => (
                <div
                  key={`${item.key || item.id}-${item.variant_id || item.variantId}`}
                  className="flex gap-3 rounded-2xl border border-[#dce5df] bg-white p-3 shadow-sm"
                >
                  {item.image ? (
                    <img
                      alt={item.title}
                      className="h-16 w-16 rounded-xl object-cover"
                      src={item.image}
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#e8f1eb] text-lg font-bold text-[#3c8060]">
                      {item.title?.charAt(0)?.toUpperCase() || "P"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#18221d]">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-[#718078]">
                      {item.variant_title || "Default"}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[#2f8c59]">
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: cart.currency || "USD",
                      }).format((item.price * item.quantity) / 100)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2 rounded-lg border border-[#dce5df] bg-[#f8faf8] px-2 py-1">
                      <button
                        aria-label={`Decrease quantity for ${item.title}`}
                        className="h-6 w-6 rounded-md text-sm font-bold text-[#53645b] hover:bg-[#e5efe7]"
                        onClick={() =>
                          updateQuantity(
                            item.line,
                            Math.max(0, item.quantity - 1),
                          )
                        }
                        type="button"
                      >
                        −
                      </button>
                      <span className="min-w-[18px] text-center text-sm font-semibold text-[#18221d]">
                        {item.quantity}
                      </span>
                      <button
                        aria-label={`Increase quantity for ${item.title}`}
                        className="h-6 w-6 rounded-md text-sm font-bold text-[#53645b] hover:bg-[#e5efe7]"
                        onClick={() =>
                          updateQuantity(item.line, item.quantity + 1)
                        }
                        type="button"
                      >
                        +
                      </button>
                    </div>
                    <button
                      className="text-xs font-semibold text-[#b34b3f] hover:underline"
                      onClick={() => removeItem(item.line)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[#dce5df] bg-white px-5 py-4">
          <div className="mb-3 flex items-center justify-between text-sm text-[#53645b]">
            <span>Subtotal</span>
            <strong className="text-base font-semibold text-[#18221d]">
              {subtotal}
            </strong>
          </div>

          <a
            className="flex w-full items-center justify-center rounded-xl bg-[#2f8c59] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#246f46]"
            href={`https://${shopDomain}/checkout`}
            rel="noreferrer"
            target="_blank"
          >
            Checkout
          </a>
        </div>
      </div>
    </div>
  );
}

CartDrawer.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  shopDomain: PropTypes.string.isRequired,
  onCartDataChange: PropTypes.func,
};

CartDrawer.defaultProps = {
  onCartDataChange: null,
};

export default function App() {
  const { apiKey, shopDomain } = useLoaderData();
  const navigation = useNavigation();
  const isNavigating = navigation.state === "loading";
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartData, setCartData] = useState(null);
  const cartCount = cartData?.item_count ?? 0;

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Product Dashboard</s-link>
        <s-link href="/app/product">Product Page</s-link>
        <s-link href="/app/single-product">Single Product</s-link>
        <s-link href="/app/assign">Assign</s-link>
      </s-app-nav>

      <div className="fixed right-4 top-4 z-40">
        <button
          aria-label="Open cart"
          className="relative flex h-12 w-12 items-center justify-center rounded-full border border-[#dce5df] bg-white text-[#1b2a22] shadow-lg transition hover:border-[#99b9a5] hover:text-[#2f8c59]"
          onClick={() => setIsCartOpen(true)}
          type="button"
        >
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            viewBox="0 0 24 24"
          >
            <path
              d="M3 4h2l1.7 8.4a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 2-1.6L19 6H7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="10" cy="18" r="1.5" />
            <circle cx="17" cy="18" r="1.5" />
          </svg>
          {cartCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2f8c59] px-1 text-[10px] font-bold text-white">
              {cartCount}
            </span>
          ) : null}
        </button>
      </div>

      <CartDrawer
        isOpen={isCartOpen}
        onCartDataChange={setCartData}
        onClose={() => setIsCartOpen(false)}
        shopDomain={shopDomain}
      />

      <Outlet />
      {isNavigating ? (
        <div
          aria-label="Loading page"
          aria-live="polite"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#f6f7f5]/70 backdrop-blur-[2px]"
          role="status"
        >
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-[#c7e5d2] border-t-[#2f8c59]" />
        </div>
      ) : null}
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
