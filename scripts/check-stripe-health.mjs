import Stripe from "stripe";
import { loadLocalEnvironment } from "./database-utils.mjs";

loadLocalEnvironment();

const secretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const plans = [
  { key: "SINGULAR", expectedAmount: 10990 },
  { key: "DUO", expectedAmount: 15990 },
  { key: "MASTER", expectedAmount: 20990 },
];

if (!secretKey?.startsWith("sk_")) throw new Error("STRIPE_SECRET_KEY ausente ou inválida.");
if (!webhookSecret?.startsWith("whsec_")) throw new Error("STRIPE_WEBHOOK_SECRET ausente ou inválido.");

const stripe = new Stripe(secretKey, { maxNetworkRetries: 2 });
const account = await stripe.accounts.retrieve();
if (!account.id) throw new Error("Não foi possível identificar a conta Stripe.");

for (const plan of plans) {
  const priceId = process.env[`STRIPE_PRICE_${plan.key}`];
  if (!priceId) throw new Error(`STRIPE_PRICE_${plan.key} não configurado.`);
  const price = await stripe.prices.retrieve(priceId);
  const valid =
    price.active &&
    price.currency === "brl" &&
    price.unit_amount === plan.expectedAmount &&
    price.recurring?.interval === "month";
  if (!valid) throw new Error(`Preço ${plan.key} não corresponde ao plano mensal esperado.`);
  console.log(`OK plano ${plan.key.toLowerCase()}: mensal, BRL, ativo`);
}

console.log(`OK conta Stripe conectada: ${account.id}`);
console.log("OK segredo de webhook configurado");
