import { Link, useLocation } from "react-router";
import { useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";

export default function ProductDetailPage() {
  const location = useLocation();
  const product = location.state?.product;
  const relatedProducts = [];

  useEffect(() => {
    if (product) {
      console.log("Single product data:", JSON.stringify(product, null, 2));
    }
  }, [product]);

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
            className="text-sm font-semibold text-[#2f8c59] hover:underline"
            to={{ pathname: "/app/product", search: location.search }}
          >
            Back to products
          </Link>
          <main className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
            <section className="overflow-hidden rounded-2xl border border-[#dce5df] bg-white shadow-[0_8px_24px_rgba(32,54,42,0.04)]">
              {product.featuredImage?.url ? (
                <img
                  alt={product.featuredImage.altText || product.title}
                  className="aspect-4/3 w-full object-cover"
                  src={product.featuredImage.url}
                />
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
                        <img
                          alt={related.featuredImage.altText || related.title}
                          className="aspect-4/3 w-full object-cover"
                          src={related.featuredImage.url}
                        />
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
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
