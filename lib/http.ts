export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export class HttpError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

type HttpOptions = {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export async function httpText(url: string, options: HttpOptions = {}): Promise<string> {
  const { method = "GET", body, headers = {}, timeoutMs = 9000 } = options;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      body,
      headers: {
        "user-agent": UA,
        ...headers,
      },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new HttpError("The request timed out. Try again.", 504);
    }
    throw new HttpError("Could not reach the source. Check your connection.", 502);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new HttpError(`Request failed (${res.status}).`, res.status);
  }
  return text;
}

export async function httpJson<T>(url: string, options: HttpOptions = {}): Promise<T> {
  const text = await httpText(url, {
    ...options,
    headers: { accept: "application/json", ...options.headers },
  });
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError("The source returned an unexpected response.", 502);
  }
}
