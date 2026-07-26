const workerStubUrl = new URL("./cloudflare-workers-stub.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: workerStubUrl, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
