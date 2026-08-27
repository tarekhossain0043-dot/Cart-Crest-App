import { Link, useLoaderData, useLocation } from "react-router";
import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(`#graphql
    query ProductDetails {
      shop { myshopifyDomain }
      products(first: 5, sortKey: UPDATED_AT, reverse: true) {
        nodes {
          id title handle status productType vendor totalInventory
          featuredImage { url altText }
          variants(first: 1) { nodes { id price sku } }
        }
      }
    }`);
  const responseJson = await response.json();
  if (responseJson.errors?.length) {
    throw new Error(
      responseJson.errors.map(({ message }) => message).join(", "),
    );
  }
  return {
    shopDomain: responseJson.data?.shop?.myshopifyDomain ?? "",
    products: responseJson.data?.products?.nodes ?? [],
  };
};

function SuccessToast({ message, onDismiss }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef(null);

  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, 1000);
    return () => window.clearTimeout(timeout);
  }, [onDismiss]);

  const handlePointerDown = (event) => {
    dragStart.current = {
      pointerId: event.pointerId,
      x: event.clientX - offset.x,
      y: event.clientY - offset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event) => {
    if (!dragStart.current) return;
    setOffset({
      x: event.clientX - dragStart.current.x,
      y: event.clientY - dragStart.current.y,
    });
  };
  const handlePointerUp = (event) => {
    if (dragStart.current?.pointerId === event.pointerId) {
      dragStart.current = null;
      if (Math.abs(offset.x) > 80 || Math.abs(offset.y) > 50) onDismiss();
    }
  };

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 cursor-grab touch-none rounded-xl border border-[#b8d9c4] bg-white px-4 py-3 text-sm font-semibold text-[#287044] shadow-[0_12px_32px_rgba(32,54,42,0.18)] active:cursor-grabbing"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="status"
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
    >
      <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#37a566]" />
      {message}
    </div>
  );
}

SuccessToast.propTypes = {
  message: PropTypes.string.isRequired,
  onDismiss: PropTypes.func.isRequired,
};

export default function ProductDetailPage() {
  const { products, shopDomain } = useLoaderData();
  const location = useLocation();
  const product = location.state?.product;
  const [toast, setToast] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const relatedProducts = products.filter((item) => item.id !== product?.id);

  useEffect(() => {
    if (product) {
      console.log("Single product data:", JSON.stringify(product, null, 2));
    }
  }, [product]);

  const addToCart = async () => {
    const variantId = variant?.id?.split("/").pop();
    if (!shopDomain || !variantId || isAdding) return;
    setIsAdding(true);
    try {
      const response = await fetch(
        `https://${shopDomain}/apps/cart-crest/cart/add.js`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            items: [{ id: Number(variantId), quantity: 1 }],
          }),
        },
      );
      if (!response.ok) throw new Error("Unable to add this product to cart.");
      await response.json();
      document.dispatchEvent(new CustomEvent("cart:refresh"));
      setToast("Added to cart");
    } catch (error) {
      setToast(error.message || "Unable to add this product to cart.");
    } finally {
      setIsAdding(false);
    }
  };

  if (!product) {
    return (
      <s-page heading="Product details">
        <div className="p-8 text-center">
          <p className="text-lg font-semibold">
            Select a product to view details.
          </p>
          <Link
            className="mt-4 inline-block text-sm font-semibold text-[#2f8c59] hover:underline"
            to={{ pathname: "/app/product", search: location.search }}
          >
            Back to products
          </Link>
        </div>
      </s-page>
    );
  }

  const variant = product.variants?.nodes?.[0];

  return (
    <s-page heading={product.title}>
      <div className="min-h-screen bg-[#f6f7f5] px-4 py-6 text-[#18221d] sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <Link
            className="text-sm font-semibold text-[#2f8c59] hover:underline group"
            to={{ pathname: "/app/product", search: location.search }}
          >
            <span className="text-[#e1a24a] text-md group-hover:hover:text-[#2f8c59]">
              &lt;-
            </span>{" "}
            Back to products
          </Link>
          <main className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
            <section className="overflow-hidden rounded-2xl border border-[#dce5df] bg-white shadow-[0_8px_24px_rgba(32,54,42,0.04)]">
              {product.featuredImage?.url ? (
                <div className="aspect-4/3 w-full object-cover h-full overflow-hidden group">
                  <img
                    alt={product.featuredImage.altText || product.title}
                    className="aspect-4/3 w-full object-cover h-full p-5 rounded-2xl transition-all duration-500 group-hover:scale-120"
                    src={product.featuredImage.url}
                  />
                </div>
              ) : (
                <div className="flex aspect-4/3 items-center justify-center bg-[#e8f1eb] text-8xl font-bold text-[#3c8060]">
                  {product.title.charAt(0)}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-[#dce5df] bg-white p-6 shadow-[0_8px_24px_rgba(32,54,42,0.04)] sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#3c8060]">
                Product details
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                {product.title}
              </h1>
              <p className="mt-2 text-sm text-[#87938c]">/{product.handle}</p>
              <p className="mt-6 text-3xl font-semibold text-[#2f8c59]">
                {variant?.price ? `$${variant.price}` : "Price unavailable"}
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3 border-y border-[#edf1ee] py-4 text-sm">
                <span className="text-[#718078]">Status</span>
                <strong>{product.status}</strong>
                <span className="text-[#718078]">Inventory</span>
                <strong>{product.totalInventory ?? 0} units</strong>
                <span className="text-[#718078]">Type</span>
                <strong>{product.productType || "General"}</strong>
                <span className="text-[#718078]">Vendor</span>
                <strong>{product.vendor || "Not specified"}</strong>
                <span className="text-[#718078]">SKU</span>
                <strong>{variant?.sku || "Not specified"}</strong>
              </div>

              {product.descriptionHtml ? (
                <div
                  className="prose prose-sm mt-6 max-w-none text-[#53645b]"
                  dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
                />
              ) : (
                <p className="mt-6 text-sm text-[#718078]">
                  No description available.
                </p>
              )}
              <button
                className="mt-6 w-full rounded-xl bg-[#193a2a] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#2f6048] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isAdding || !variant?.id}
                onClick={addToCart}
                type="button"
              >
                {isAdding ? "Adding..." : "Add to cart"}
              </button>
            </section>
          </main>

          <section className="mt-10">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#3c8060]">
                  Keep browsing
                </p>
                <h2 className="mt-1 text-2xl font-semibold">
                  Related products
                </h2>
              </div>
              <Link
                className="text-sm font-semibold text-[#2f8c59] hover:underline"
                to={{ pathname: "/app/product", search: location.search }}
              >
                View all
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {relatedProducts.map((related) => {
                const relatedVariant = related.variants?.nodes?.[0];
                const cleanId = related.id.split("/").pop();
                return (
                  <article
                    className="overflow-hidden rounded-2xl border border-[#dce5df] bg-white shadow-[0_8px_24px_rgba(32,54,42,0.04)]"
                    key={related.id}
                  >
                    <Link
                      to={{
                        pathname: `/app/product/${cleanId}`,
                        search: location.search,
                      }}
                    >
                      {related.featuredImage?.url ? (
                        <div className="overflow-hidden group">
                          <img
                            alt={related.featuredImage.altText || related.title}
                            className="aspect-4/3 w-full object-cover transition-all duration-500 ease-in-out group-hover:scale-110"
                            src={related.featuredImage.url}
                          />
                        </div>
                      ) : (
                        <div className="flex aspect-4/3 items-center justify-center bg-[#e8f1eb] text-4xl font-bold text-[#3c8060]">
                          {related.title.charAt(0)}
                        </div>
                      )}
                      <div className="p-4">
                        <h3 className="truncate font-semibold">
                          {related.title}
                        </h3>
                        <p className="mt-1 text-sm font-semibold text-[#2f8c59]">
                          {relatedVariant?.price
                            ? `$${relatedVariant.price}`
                            : "Price unavailable"}
                        </p>
                      </div>
                    </Link>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>
      {toast ? (
        <SuccessToast message={toast} onDismiss={() => setToast("")} />
      ) : null}
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
