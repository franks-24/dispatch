export function createDeliveryApi({base, origin, getUser, fetcher = fetch}) {
  if (!base.startsWith("/") || base.startsWith("//") || base.includes("?") || base.includes("#") || base.includes("\\")) throw new Error("Delivery API must use a same-origin path.");
  const root = new URL(base.replace(/\/$/, "") + "/", origin);
  if (root.origin !== new URL(origin).origin) throw new Error("Invalid API origin.");
  async function request(path, {body, key, pdf = false, signal} = {}) {
    const user = getUser();
    if (!user) throw new Error("Sign in with Google to continue.");
    const url = new URL(path, root);
    if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) throw new Error("Invalid API route.");
    const token = await user.getIdToken();
    if (getUser()?.uid !== user.uid) throw new Error("Your session changed. Please try again.");
    const response = await fetcher(url.href, {method: body ? "POST" : "GET", redirect: "error", cache: "no-store", credentials: "omit", signal: signal ?? AbortSignal.timeout(20000), headers: {Authorization: `Bearer ${token}`, Accept: pdf ? "application/pdf" : "application/json", ...(body ? {"Content-Type": "application/json", "Idempotency-Key": key} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
    if (getUser()?.uid !== user.uid) throw new Error("Your session changed. Please try again.");
    if (!response.ok) throw new Error(({401:"Your session expired. Sign in again.",403:"You cannot access this delivery.",404:"No matching delivery was found in your account.",409:"This request needs review. Refresh before retrying.",429:"Too many requests. Please try again shortly."})[response.status] || "Delivery service unavailable. Please try again later.");
    if (pdf) {
      if (!response.headers.get("content-type")?.startsWith("application/pdf")) throw new Error("Proof of delivery is unavailable.");
      const blob = await response.blob();
      if (blob.size > 10 * 1024 * 1024) throw new Error("Proof document exceeds the download limit.");
      return blob;
    }
    if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Delivery service is not connected.");
    return response.json();
  }
  const id = value => {if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error("Enter a valid delivery reference."); return value;};
  return {
    quotes: () => request("quotes"),
    shipments: () => request("shipments?limit=100"),
    track: reference => request(`shipments/${id(reference)}`),
    quote: (input, acceptance, key) => request("quotes", {body: {...input, acceptance}, key}),
    book: (input, acceptance, key) => request("bookings", {body: {...input, acceptance}, key}),
    proof: reference => request(`shipments/${id(reference)}/proof`, {pdf:true})
  };
}
