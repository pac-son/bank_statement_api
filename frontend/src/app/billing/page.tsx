import CheckoutButton from "@/components/CheckoutButton";

// Temporary mock data based on your billing.py tiers
const MOCK_PLANS = [
  { id: "payg", name: "Pay-As-You-Go", price: "₦350" },
  { id: "growth", name: "Fintech Growth", price: "₦50,000" },
  { id: "enterprise", name: "Enterprise Underwriter", price: "₦200,000" }
];

export default function BillingRoute() {
  // Hardcoded for testing; later you will fetch this from your auth state
  const testApiKey = "cdv_test_123456"; 

  return (
    <div className="container-page py-12">
      <h1 className="text-3xl font-bold mb-8">Upgrade your plan</h1>
      <PricingPage plans={MOCK_PLANS} userApiKey={testApiKey} />
    </div>
  );
}

export function PricingPage({ plans, userApiKey }: { plans: any[], userApiKey: string }) {
  return (
    <div className="grid sm:grid-cols-3 gap-4">
      {plans.filter(plan => plan.id !== "trial").map((plan) => (
        <div key={plan.id} className="card p-6">
          <h3 className="text-lg font-bold">{plan.name}</h3>
          <p className="text-2xl mt-2">{plan.price}</p>
          <div className="mt-6">
            <CheckoutButton 
              planId={plan.id} 
              amount={plan.id === "growth" ? 50000 : plan.id === "enterprise" ? 200000 : 350} 
              apiKey={userApiKey} 
              buttonText={`Select ${plan.name}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}