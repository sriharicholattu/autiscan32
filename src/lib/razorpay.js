export const PLANS = {
  starter: {
    name: 'Starter',
    monthly: { amount: 299900, label: '₹2,999/mo', period: 'monthly' },
    yearly:  { amount: 2999900, label: '₹29,999/yr', period: 'yearly', saving: 'Save ₹5,989' },
    features: ['Up to 3 Clinicians', '50 Sessions/mo', 'Basic AI Assessment', 'PDF Reports', 'Email Support'],
  },
  professional: {
    name: 'Professional',
    monthly: { amount: 699900, label: '₹6,999/mo', period: 'monthly' },
    yearly:  { amount: 6999900, label: '₹69,999/yr', period: 'yearly', saving: 'Save ₹13,989' },
    features: ['Up to 10 Clinicians', '200 Sessions/mo', 'Full AI + Camera + Voice', 'Detailed Reports', 'Priority Support'],
    popular: true,
  },
  enterprise: {
    name: 'Enterprise',
    monthly: { amount: 1499900, label: '₹14,999/mo', period: 'monthly' },
    yearly:  { amount: 14999900, label: '₹1,49,999/yr', period: 'yearly', saving: 'Save ₹29,989' },
    features: ['Unlimited Clinicians', 'Unlimited Sessions', 'Advanced AI Models', 'Custom Branding', 'Dedicated Support'],
  },
}

export function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export async function openRazorpayCheckout({ planKey, period, clinicName, email, onSuccess }) {
  const loaded = await loadRazorpay()
  if (!loaded) { alert('Razorpay failed to load. Check your internet connection.'); return }

  const plan = PLANS[planKey]
  const priceInfo = plan[period]

  const options = {
    key: import.meta.env.VITE_RAZORPAY_KEY_ID,
    amount: priceInfo.amount,
    currency: 'INR',
    name: 'AutiScan',
    description: `${plan.name} Plan — ${priceInfo.label}`,
    image: '',
    prefill: { name: clinicName, email },
    notes: { plan: planKey, period },
    theme: { color: '#0b8f7e' },
    handler: function (response) {
      // response.razorpay_payment_id is the payment ID
      onSuccess({
        paymentId: response.razorpay_payment_id,
        plan: planKey,
        period,
        amount: priceInfo.amount,
      })
    },
  }

  const rzp = new window.Razorpay(options)
  rzp.open()
}
