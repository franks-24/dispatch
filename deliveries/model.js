export const statuses = Object.freeze({ requested: "Booking requested", confirmed: "Booking confirmed", collected: "Collected", in_transit: "In transit", out_for_delivery: "Out for delivery", delivered: "Delivered", exception: "Delivery exception", cancelled: "Cancelled" });
export function quoteInput(data) {
  const result = {};
  for (const field of ["pickupArea", "deliveryArea"]) {
    const value = String(data[field] ?? "").trim();
    if (value.length < 3 || value.length > 160) throw new Error("Enter valid collection and delivery areas.");
    result[field] = value;
  }
  for (const field of ["weightKg", "lengthCm", "widthCm", "heightCm"]) {
    const value = Number(data[field]);
    if (!Number.isFinite(value) || value <= 0 || value > (field === "weightKg" ? 1000 : 500)) throw new Error("Enter valid parcel weight and dimensions.");
    result[field] = value;
  }
  if (!["economy", "express"].includes(data.service)) throw new Error("Choose a delivery service.");
  result.service = data.service;
  return result;
}
export function bookable(quote, now = Date.now()) {
  return Boolean(quote && quote.status === "quoted" && typeof quote.id === "string" && quote.id.length && Number.isSafeInteger(quote.totalMinor) && quote.totalMinor > 0 && quote.currency === "ZAR" && Date.parse(quote.expiresAt) > now);
}
export function money(quote) {
  return Number.isSafeInteger(quote.totalMinor) && quote.totalMinor > 0 && quote.currency === "ZAR" ? new Intl.NumberFormat("en-ZA", {style: "currency", currency: "ZAR"}).format(quote.totalMinor / 100) : "Price pending";
}
export function bookingInput(data, quote, now) {
  if (!bookable(quote, now)) throw new Error("Choose a current, priced quote before booking.");
  const result = {quoteId: quote.id};
  for (const field of ["pickupAddress", "deliveryAddress", "recipientName", "recipientPhone"]) {
    const value = String(data[field] ?? "").trim();
    if (value.length < 3 || value.length > 300) throw new Error("Complete both addresses and recipient details.");
    result[field] = value;
  }
  if (!/^\+?[\d ()-]{7,30}$/.test(result.recipientPhone)) throw new Error("Enter a valid recipient phone number.");
  return result;
}
