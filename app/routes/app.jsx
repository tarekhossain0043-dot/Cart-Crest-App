import {
  Outlet,
  useLoaderData,
  useNavigation,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();
  const navigation = useNavigation();
  const isNavigating = navigation.state === "loading";

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Product Dashboard</s-link>
        <s-link href="/app/product">Product Page</s-link>
        <s-link href="/app/single-product">Single Product</s-link>
        <s-link href="/app/assign">Assign</s-link>
      </s-app-nav>
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

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
