import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

const RECOMMENDATION_NAMESPACE = "$app";
const RECOMMENDATION_KEY = "cart_crest_recommendations";

const productQuery = `#graphql
	query AssignProducts {
		products(first: 100, sortKey: TITLE) {
			nodes {
				id title handle status
				featuredImage { url altText }
				variants(first: 1) { nodes { price } }
				recommendation: metafield(namespace: "$app", key: "cart_crest_recommendations") { jsonValue }
			}
		}
	}`;

function getGraphqlError(responseJson) {
  return responseJson.errors?.length
    ? responseJson.errors.map(({ message }) => message).join(", ")
    : null;
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const responseJson = await (await admin.graphql(productQuery)).json();
  const error = getGraphqlError(responseJson);
  if (error) throw new Error(error);
  return { products: responseJson.data?.products?.nodes ?? [] };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const sourceProductId = String(formData.get("sourceProductId") || "");
  const recommendationIds = JSON.parse(
    String(formData.get("recommendationIds") || "[]"),
  );
  const mode = String(formData.get("mode") || "cross-sell");
  const headline = String(
    formData.get("headline") || "You may also like",
  ).trim();
  const discount = String(formData.get("discount") || "0");

  if (!sourceProductId || !Array.isArray(recommendationIds)) {
    return { error: "Choose a product and at least one recommendation." };
  }

  const cleanRecommendationIds = [
    ...new Set(recommendationIds.filter((id) => id && id !== sourceProductId)),
  ].slice(0, 6);
  if (!cleanRecommendationIds.length)
    return { error: "Choose at least one different product to recommend." };

  const recommendationProductsResponse = await admin.graphql(
    `#graphql
      query RecommendationProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product { id handle }
        }
      }`,
    { variables: { ids: cleanRecommendationIds } },
  );
  const recommendationProductsJson =
    await recommendationProductsResponse.json();
  const recommendationProducts = recommendationProductsJson.data?.nodes ?? [];

  const responseJson = await (
    await admin.graphql(
      `#graphql
			mutation SaveRecommendations($productId: ID!, $metafields: [MetafieldsSetInput!]!) {
				metafieldsSet(productId: $productId, metafields: $metafields) { metafields { id } userErrors { field message } }
			}`,
      {
        variables: {
          productId: sourceProductId,
          metafields: [
            {
              namespace: RECOMMENDATION_NAMESPACE,
              key: RECOMMENDATION_KEY,
              type: "json",
              value: JSON.stringify({
                mode,
                headline: headline || "You may also like",
                discount: Math.max(0, Math.min(100, Number(discount) || 0)),
                productIds: cleanRecommendationIds,
                products: recommendationProducts.map(({ id, handle }) => ({
                  id,
                  handle,
                })),
                updatedAt: new Date().toISOString(),
              }),
            },
          ],
        },
      },
    )
  ).json();
  const error = getGraphqlError(responseJson);
  if (error) return { error };
  const userErrors = responseJson.data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length)
    return { error: userErrors.map(({ message }) => message).join(", ") };
  return { saved: true };
};

export default function AssignPage() {
  const { products } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [sourceProductId, setSourceProductId] = useState("");
  const [recommendationIds, setRecommendationIds] = useState([]);
  const [mode, setMode] = useState("cross-sell");
  const [headline, setHeadline] = useState("You may also like");
  const [discount, setDiscount] = useState("0");
  const isSaving = fetcher.state !== "idle";
  const availableProducts = products.filter(
    (product) => product.id !== sourceProductId,
  );
  const sourceProduct = products.find(
    (product) => product.id === sourceProductId,
  );

  useEffect(() => {
    if (fetcher.data?.saved) shopify.toast.show("Recommendations saved");
    if (fetcher.data?.error)
      shopify.toast.show(fetcher.data.error, { isError: true });
  }, [fetcher.data, shopify]);

  useEffect(() => {
    if (!sourceProduct?.recommendation?.jsonValue) return;
    const saved = sourceProduct.recommendation.jsonValue;
    setRecommendationIds(saved.productIds ?? []);
    setMode(saved.mode ?? "cross-sell");
    setHeadline(saved.headline ?? "You may also like");
    setDiscount(String(saved.discount ?? 0));
  }, [sourceProduct]);

  const toggleRecommendation = (productId) =>
    setRecommendationIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : current.length < 6
          ? [...current, productId]
          : current,
    );
  const saveRecommendations = (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("recommendationIds", JSON.stringify(recommendationIds));
    fetcher.submit(formData, { method: "POST" });
  };

  return (
    <s-page heading="Assign recommendations">
      <div className="min-h-screen bg-[#f6f7f5] px-4 py-6 text-[#18221d] sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <header className="mb-8">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#3c8060]">
              Cart conversion / Product pairing
            </p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Build a smarter cart
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[#64736b]">
              Select a product and the items customers are most likely to add
              with it. The pairing is saved to Shopify and can power your cart
              extension.
            </p>
          </header>
          <fetcher.Form
            className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]"
            onSubmit={saveRecommendations}
          >
            <section className="rounded-2xl border border-[#dce5df] bg-white p-5 shadow-[0_8px_24px_rgba(32,54,42,0.04)] sm:p-7">
              <div className="mb-6 flex items-end justify-between gap-4 border-b border-[#edf1ee] pb-5">
                <div>
                  <h2 className="text-xl font-semibold">
                    Choose recommendations
                  </h2>
                  <p className="mt-1 text-sm text-[#718078]">
                    Up to 6 products per pairing
                  </p>
                </div>
                <span className="text-sm font-semibold text-[#2f8c59]">
                  {recommendationIds.length}/6 selected
                </span>
              </div>
              <label
                className="block text-sm font-semibold"
                htmlFor="sourceProductId"
              >
                When customers view
                <select
                  className="mt-2 w-full rounded-xl border border-[#cbd8cf] bg-[#fbfcfb] px-3 py-3 text-sm font-normal outline-none focus:border-[#3c8060]"
                  id="sourceProductId"
                  name="sourceProductId"
                  onChange={(event) => {
                    setSourceProductId(event.target.value);
                    setRecommendationIds([]);
                  }}
                  required
                  value={sourceProductId}
                >
                  <option value="">Select a product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.title}
                    </option>
                  ))}
                </select>
              </label>
              {/* product list wraper*/}
              <div className="h-full pt-6 overflow-y-hidden">
                <div className="max-h-[300px] pb-6 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="mt-6 grid gap-3 sm:grid-cols-2 overflow-y-auto">
                    {availableProducts.map((product) => {
                      const selected = recommendationIds.includes(product.id);
                      return (
                        <label
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${selected ? "border-[#3c8060] bg-[#f0f8f2]" : "border-[#e3eae5] hover:border-[#abc9b4]"}`}
                          key={product.id}
                        >
                          <input
                            checked={selected}
                            className="h-4 w-4 accent-[#3c8060]"
                            disabled={
                              !selected && recommendationIds.length >= 6
                            }
                            onChange={() => toggleRecommendation(product.id)}
                            type="checkbox"
                          />
                          {product.featuredImage?.url ? (
                            <img
                              alt={
                                product.featuredImage.altText || product.title
                              }
                              className="h-12 w-12 rounded-lg object-cover"
                              src={product.featuredImage.url}
                            />
                          ) : (
                            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#e8f1eb] font-bold text-[#3c8060]">
                              {product.title.charAt(0)}
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {product.title}
                            </span>
                            <span className="text-xs text-[#87938c]">
                              {product.variants.nodes[0]?.price
                                ? `$${product.variants.nodes[0].price}`
                                : "Price unavailable"}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
            <aside className="h-fit rounded-2xl border border-[#dce5df] bg-[#18221d] p-5 text-white shadow-[0_8px_24px_rgba(32,54,42,0.08)] sm:p-7">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9bd0aa]">
                Offer settings
              </p>
              <h2 className="mt-2 text-xl font-semibold">Shape the nudge</h2>
              <label
                className="mt-6 block text-sm font-semibold"
                htmlFor="mode"
              >
                Recommendation type
                <select
                  className="mt-2 w-full rounded-xl border-0 bg-white/10 px-3 py-3 text-sm font-normal text-white outline-none"
                  id="mode"
                  name="mode"
                  onChange={(event) => setMode(event.target.value)}
                  value={mode}
                >
                  <option className="text-[#18221d]" value="cross-sell">
                    Cross-sell · complementary item
                  </option>
                  <option className="text-[#18221d]" value="upsell">
                    Upsell · upgrade option
                  </option>
                </select>
              </label>
              <label
                className="mt-4 block text-sm font-semibold"
                htmlFor="headline"
              >
                Cart headline
                <input
                  className="mt-2 w-full rounded-xl border-0 bg-white/10 px-3 py-3 text-sm font-normal text-white outline-none placeholder:text-white/50"
                  id="headline"
                  maxLength="80"
                  name="headline"
                  onChange={(event) => setHeadline(event.target.value)}
                  value={headline}
                />
              </label>
              <label
                className="mt-4 block text-sm font-semibold"
                htmlFor="discount"
              >
                Optional discount %
                <input
                  className="mt-2 w-full rounded-xl border-0 bg-white/10 px-3 py-3 text-sm font-normal text-white outline-none"
                  id="discount"
                  inputMode="numeric"
                  max="100"
                  min="0"
                  name="discount"
                  onChange={(event) => setDiscount(event.target.value)}
                  type="number"
                  value={discount}
                />
              </label>
              <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-[#9bd0aa]">
                  Preview
                </p>
                <p className="mt-2 font-semibold">
                  {headline || "You may also like"}
                </p>
                <p className="mt-1 text-sm text-white/60">
                  {sourceProduct?.title || "Your selected product"} +{" "}
                  {recommendationIds.length} recommended item
                  {recommendationIds.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                className="mt-6 w-full rounded-xl bg-[#9bd0aa] px-4 py-3 text-sm font-bold text-[#18221d] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  isSaving || !sourceProductId || !recommendationIds.length
                }
                type="submit"
              >
                {isSaving ? "Saving..." : "Save pairing"}
              </button>
            </aside>
          </fetcher.Form>
        </div>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
