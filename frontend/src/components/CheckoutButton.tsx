"use client";
import { useState } from "react";

// Silence TypeScript warnings for the global Paystack object and process
declare global {
  interface Window {
    PaystackPop: any;
  }
}
declare const process: any;

interface CheckoutButtonProps {
  planId: string;
  amount: number;
  apiKey: string;
  buttonText: string;
  email?: string;
  publicKey?: string;
}

export default function CheckoutButton({
  planId,
  amount,
  apiKey,
  buttonText,
  email = "developer@credova.io",
  publicKey,
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);

  // Dynamically inject Paystack's official inline script only when needed
  const loadPaystackScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window !== "undefined" && window.PaystackPop) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://js.paystack.co/v1/inline.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  async function handleCheckout() {
    setLoading(true);

    const isLoaded = await loadPaystackScript();
    if (!isLoaded || !window.PaystackPop) {
      alert("Unable to load Paystack checkout. Please check your internet connection.");
      setLoading(false);
      return;
    }

    // Read from props, environment variable, or fallback placeholder
    const paystackKey =
      publicKey ||
      (typeof process !== "undefined" &&
        (process.env?.NEXT_PUBLIC_PAYSTACK_KEY || process.env?.PAYSTACK_PUBLIC_KEY)) ||
      "pk_test_5bcccf19a956e37e0a8d2eb30018cb2c632748a5";

    const handler = window.PaystackPop.setup({
      key: paystackKey,
      email: email,
      amount: Math.round(amount * 100), // Convert NGN to kobo
      currency: "NGN",
      ref: `cdv_${Date.now()}_${Math.floor(Math.random() * 1000000)}`,
      metadata: {
        api_key: apiKey,
        plan_id: planId,
        custom_fields: [
          {
            display_name: "API Key",
            variable_name: "api_key",
            value: apiKey,
          },
          {
            display_name: "Plan ID",
            variable_name: "plan_id",
            value: planId,
          },
        ],
      },
      callback: function (response: { reference: string }) {
        setLoading(false);
        // Redirect upon successful payment
        window.location.href = `/billing?payment=success&reference=${response.reference}`;
      },
      onClose: function () {
        setLoading(false);
      },
    });

    handler.openIframe();
  }

  return (
    <button
      type="button"
      onClick={handleCheckout}
      disabled={loading}
      className="btn btn-primary w-full"
    >
      {loading ? "Opening Paystack..." : buttonText}
    </button>
  );
}