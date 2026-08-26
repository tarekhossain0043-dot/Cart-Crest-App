import { useEffect } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return null;
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const color = ["Red", "Orange", "Yellow", "Green"][
    Math.floor(Math.random() * 4)
  ];
  const response = await admin.graphql(
    `#graphql
      mutation populateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            title
            handle
            status
            variants(first: 10) {
              edges {
                node {
                  id
                  price
                  barcode
                  createdAt
                }
              }
            }
            demoInfo: metafield(namespace: "$app", key: "demo_info") {
              jsonValue
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        product: {
          title: `${color} Snowboard`,
          metafields: [
            {
              namespace: "$app",
              key: "demo_info",
              value: "Created by React Router Template",
            },
          ],
        },
      },
    },
  );
  const responseJson = await response.json();
  if (responseJson.errors?.length) {
    throw new Error(
      responseJson.errors.map(({ message }) => message).join(", "),
    );
  }

  const productCreate = responseJson.data?.productCreate;
  if (productCreate?.userErrors?.length) {
    throw new Error(
      productCreate.userErrors.map(({ message }) => message).join(", "),
    );
  }

  const product = productCreate?.product;
  const variantId = product?.variants?.edges?.[0]?.node?.id;
  if (!product || !variantId) {
    throw new Error("Shopify did not return a product variant. Try again.");
  }
  const variantResponse = await admin.graphql(
    `#graphql
    mutation shopifyReactRouterTemplateUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          barcode
          createdAt
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        productId: product.id,
        variants: [{ id: variantId, price: "100.00" }],
      },
    },
  );
  const variantResponseJson = await variantResponse.json();
  if (variantResponseJson.errors?.length) {
    throw new Error(
      variantResponseJson.errors.map(({ message }) => message).join(", "),
    );
  }
  const variantUpdate = variantResponseJson.data?.productVariantsBulkUpdate;
  if (variantUpdate?.userErrors?.length) {
    throw new Error(
      variantUpdate.userErrors.map(({ message }) => message).join(", "),
    );
  }
  const metaobjectResponse = await admin.graphql(
    `#graphql
    mutation shopifyReactRouterTemplateUpsertMetaobject($handle: MetaobjectHandleInput!, $values: JSON!) {
      metaobjectUpsert(handle: $handle, values: $values) {
        metaobject {
          id
          handle
          values
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        handle: {
          type: "$app:example",
          handle: "demo-entry",
        },
        values: {
          title: "Demo Entry",
          description:
            "This metaobject was created by the Shopify app template to demonstrate the metaobject API.",
        },
      },
    },
  );
  const metaobjectResponseJson = await metaobjectResponse.json();
  if (metaobjectResponseJson.errors?.length) {
    throw new Error(
      metaobjectResponseJson.errors.map(({ message }) => message).join(", "),
    );
  }
  const metaobjectUpsert = metaobjectResponseJson.data?.metaobjectUpsert;
  if (metaobjectUpsert?.userErrors?.length) {
    throw new Error(
      metaobjectUpsert.userErrors.map(({ message }) => message).join(", "),
    );
  }

  return {
    product,
    variant: variantUpdate?.productVariants,
    metaobject: metaobjectUpsert?.metaobject,
  };
};

export default function Index() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const isLoading = ["loading", "submitting"].includes(fetcher.state);
  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  useEffect(() => {
    if (fetcher.data?.product?.id) shopify.toast.show("Test product created");
    if (fetcher.data?.error)
      shopify.toast.show(fetcher.data.error, { isError: true });
  }, [fetcher.data?.product?.id, fetcher.data?.error, shopify]);

  return (
    <s-page heading="Cart Crest">
      <s-button
        slot="primary-action"
        onClick={generateProduct}
        loading={isLoading}
      >
        Create test product
      </s-button>
      <div className="min-h-screen bg-[#f6f7f5] px-4 py-6 text-[#18221d] sm:px-8 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <header className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#3c8060]">
                Store performance / Today
              </p>
              <h1 className="font-display text-4xl font-semibold tracking-tight text-[#18221d] sm:text-5xl">
                Good morning, let&apos;s recover revenue.
              </h1>
              <p className="mt-3 max-w-xl text-base leading-7 text-[#64736b]">
                A clear view of every cart that needs a gentle nudge
              </p>
            </div>
            <div className="flex items-center justify-center max-w-[150px] w-full gap-2 self-center rounded-sm border border-[#dce5df] bg-white px-3 py-2 text-sm text-[#53645b] shadow-sm md:self-auto">
              <span className="h-2 w-2 rounded-full bg-[#37a566]" />
              <span className="text-sm">Live store data</span>
            </div>
            {/* <span className="text-[#a1aca5]">/</span> 12:42 PM */}
          </header>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["$4,860", "Recovered revenue", "+18.4%", "text-[#2f8c59]"],
              ["126", "Carts recovered", "+12 today", "text-[#2f8c59]"],
              ["8.7%", "Recovery rate", "+1.2 pts", "text-[#2f8c59]"],
              ["$38.54", "Average cart value", "+4.6%", "text-[#2f8c59]"],
            ].map(([value, label, change, color]) => (
              <div
                className="rounded-2xl border border-[#dce5df] bg-white p-5 shadow-[0_8px_24px_rgba(32,54,42,0.04)]"
                key={label}
              >
                <p className="text-sm text-[#718078]">{label}</p>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <strong className="text-3xl font-semibold tracking-tight">
                    {value}
                  </strong>
                  <span className={`mb-1 text-xs font-semibold ${color}`}>
                    {change}
                  </span>
                </div>
              </div>
            ))}
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="rounded-2xl border border-[#dce5df] bg-white p-5 shadow-[0_8px_24px_rgba(32,54,42,0.04)] sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[#18221d]">
                    Recovery overview
                  </p>
                  <p className="mt-1 text-sm text-[#7a887f]">
                    Recovered revenue over the last 7 days
                  </p>
                </div>
                <button
                  className="rounded-lg border border-[#dce5df] px-3 py-2 text-xs font-semibold text-[#53645b] transition hover:border-[#99b9a5]"
                  type="button"
                >
                  Last 7 days
                </button>
              </div>
              <div className="mt-8 flex h-52 items-end gap-2 border-b border-[#e7ede9] pb-0 sm:gap-4">
                {[42, 58, 48, 73, 65, 86, 100].map((height, index) => (
                  <div
                    className="group flex h-full flex-1 flex-col justify-end gap-2"
                    key={index}
                  >
                    <div
                      className={`rounded-t-lg transition group-hover:bg-[#2f8c59] ${index === 6 ? "bg-[#e1a24a]" : "bg-[#c7e5d2]"}`}
                      style={{ height: `${height}%` }}
                    />
                    <span className="text-center text-[11px] text-[#9aa69f]">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-5 text-xs text-[#718078]">
                <span className="flex items-center gap-2">
                  <i className="h-2 w-2 rounded-full bg-[#e1a24a]" />
                  Today
                </span>
                <span className="flex items-center gap-2">
                  <i className="h-2 w-2 rounded-full bg-[#c7e5d2]" />
                  Previous days
                </span>
              </div>
            </div>
            <div className="rounded-2xl bg-[#193a2a] p-6 text-white shadow-[0_12px_32px_rgba(25,58,42,0.18)]">
              <p className="text-sm font-semibold text-[#b8d9c4]">
                Attention needed
              </p>
              <div className="mt-7 flex items-end justify-between">
                <strong className="text-6xl font-semibold tracking-tight">
                  34
                </strong>
                <span className="mb-2 rounded-full bg-[#315b46] px-3 py-1 text-xs text-[#d8eddf]">
                  +6 this hour
                </span>
              </div>
              <p className="mt-4 text-sm leading-6 text-[#b8d9c4]">
                High-intent carts are waiting. Your next campaign could bring
                them back.
              </p>
              <button
                className="mt-8 w-full rounded-xl bg-[#e1a24a] px-4 py-3 text-sm font-bold text-[#193a2a] transition hover:bg-[#edb564]"
                type="button"
              >
                Review recovery queue <span aria-hidden="true">-&gt;</span>
              </button>
            </div>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="rounded-2xl border border-[#dce5df] bg-white p-5 shadow-[0_8px_24px_rgba(32,54,42,0.04)] sm:p-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">
                    Recent recovery activity
                  </p>
                  <p className="mt-1 text-sm text-[#7a887f]">
                    The latest wins from your store
                  </p>
                </div>
                <a
                  className="text-sm font-semibold text-[#2f8c59]"
                  href="/app/additional"
                >
                  View all
                </a>
              </div>
              <div className="mt-6 divide-y divide-[#edf1ee]">
                {[
                  [
                    "JM",
                    "Jordan M.",
                    "Recovered cart",
                    "$128.00",
                    "2 min ago",
                    "bg-[#f8ddc9]",
                  ],
                  [
                    "AK",
                    "Ava K.",
                    "Email reminder",
                    "$76.50",
                    "18 min ago",
                    "bg-[#d6e6f2]",
                  ],
                  [
                    "RL",
                    "Riley L.",
                    "Recovered cart",
                    "$214.20",
                    "42 min ago",
                    "bg-[#e5dbf1]",
                  ],
                ].map(([initials, name, event, amount, time, avatar]) => (
                  <div
                    className="flex items-center gap-3 py-4 first:pt-0 last:pb-0"
                    key={name}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-[#53645b] ${avatar}`}
                    >
                      {initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{name}</p>
                      <p className="text-xs text-[#87938c]">
                        {event} <span className="mx-1">/</span> {time}
                      </p>
                    </div>
                    <strong className="text-sm font-semibold text-[#2f8c59]">
                      +{amount}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-[#dce5df] bg-[#fffdf8] p-6 shadow-[0_8px_24px_rgba(32,54,42,0.04)]">
              <p className="text-sm font-semibold">Quick actions</p>
              <p className="mt-1 text-sm text-[#7a887f]">
                Keep your recovery engine moving.
              </p>
              <div className="mt-5 grid gap-2">
                <a
                  className="flex items-center justify-between rounded-xl border border-[#e8e3d8] bg-white px-4 py-3 text-sm font-semibold transition hover:border-[#e1a24a]"
                  href="/app/additional"
                >
                  Create recovery flow{" "}
                  <span className="text-[#e1a24a]">-&gt;</span>
                </a>
                <button
                  className="flex items-center justify-between rounded-xl border border-[#e8e3d8] bg-white px-4 py-3 text-left text-sm font-semibold transition hover:border-[#e1a24a]"
                  onClick={generateProduct}
                  type="button"
                >
                  Create test product{" "}
                  <span className="text-[#e1a24a]">-&gt;</span>
                </button>
              </div>
              {fetcher.data?.product && (
                <p className="mt-4 rounded-lg bg-[#e7f4eb] p-3 text-xs text-[#2f8c59]">
                  Test product created successfully.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
